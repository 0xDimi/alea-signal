import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const CONFIG_PATH = path.join(process.cwd(), "config/app-config.json");
const EVENTS_BASE_URL =
  "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100&offset=";
const MAX_RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeNumber = (value) => {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const pickFirstNumber = (...values) => {
  for (const value of values) {
    const num = safeNumber(value);
    if (num !== null) return num;
  }
  return null;
};

const parseDate = (value) => {
  if (!value) return null;
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeTags = (tags) => {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => {
      if (typeof tag === "string") {
        return { slug: tag.toLowerCase(), name: tag };
      }
      if (tag?.slug) {
        return { slug: String(tag.slug).toLowerCase(), name: tag.name ?? tag.slug };
      }
      if (tag?.tag?.slug) {
        return {
          slug: String(tag.tag.slug).toLowerCase(),
          name: tag.tag.name ?? tag.tag.slug,
        };
      }
      return null;
    })
    .filter(Boolean);
};

const buildMarketUrl = (slug, eventSlug) => {
  if (slug) return `https://polymarket.com/market/${slug}`;
  if (eventSlug) return `https://polymarket.com/event/${eventSlug}`;
  return null;
};

const slimEventPayload = (event) => {
  if (!event || typeof event !== "object") return event ?? null;
  const slim = { ...event };
  if ("markets" in slim) {
    delete slim.markets;
  }
  return slim;
};

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const logScore = (value, ref, maxScore) => {
  if (!ref || ref <= 0 || value <= 0) return 0;
  const scaled = Math.log10(1 + value) / Math.log10(1 + ref);
  return clamp(maxScore * scaled, 0, maxScore);
};

const fetchJson = async (url, attempt = 0) => {
  const response = await fetch(url);
  if (!response.ok) {
    if (attempt < MAX_RETRIES) {
      await sleep(400 * Math.pow(2, attempt));
      return fetchJson(url, attempt + 1);
    }
    throw new Error(`Gamma API error ${response.status} for ${url}`);
  }
  return response.json();
};

const fetchAllEvents = async () => {
  const events = [];
  let offset = 0;
  while (true) {
    const url = `${EVENTS_BASE_URL}${offset}`;
    const payload = await fetchJson(url);
    const batch = Array.isArray(payload)
      ? payload
      : payload?.data ?? payload?.events ?? [];
    if (!batch.length) break;
    events.push(...batch);
    offset += batch.length;
    if (batch.length < 100) break;
    await sleep(200);
  }
  return events;
};

const buildAllowedTagSet = (config) => {
  const allowed = new Set();
  const sectors = config.allowed_sectors ?? [];
  const map = config.sector_map ?? {};
  sectors.forEach((sector) => {
    const tags = map[sector] ?? [];
    tags.forEach((tag) => allowed.add(String(tag).toLowerCase()));
  });
  return allowed;
};

const buildExcludeTagSet = (config) => {
  return new Set((config.exclude_tags ?? []).map((tag) => String(tag).toLowerCase()));
};

const scoreMarket = (market, config, refs) => {
  const weights = {
    liquidity: 25,
    volume24h: 15,
    openInterest: 10,
    resolutionSource: 20,
    endDate: 10,
    fit: 20,
    ...(config.weights ?? {}),
  };
  const penalties = { restricted: -10, missing_tags: -5, ...(config.penalties ?? {}) };
  const thresholds = {
    min_liquidity: 0,
    min_volume24h: 0,
    min_open_interest: 0,
    ...(config.flags_thresholds ?? {}),
  };
  const flags = [];

  const liqScore = logScore(market.liquidity, refs.liquidity, weights.liquidity);
  const volScore = logScore(market.volume24h, refs.volume24h, weights.volume24h);
  const oiScore = logScore(market.openInterest, refs.openInterest, weights.openInterest);

  const hasResolutionSource = Boolean(market.resolutionSource);
  const hasEndDate = Boolean(market.endDate);
  const resolutionScore = hasResolutionSource ? weights.resolutionSource : 0;
  const endDateScore = hasEndDate ? weights.endDate : 0;

  if (!hasResolutionSource) flags.push("missing_resolution_source");
  if (!hasEndDate) flags.push("missing_end_date");
  if (market.liquidity < thresholds.min_liquidity) flags.push("low_liquidity");
  if (market.volume24h < thresholds.min_volume24h) flags.push("low_volume24h");
  if (market.openInterest < thresholds.min_open_interest) flags.push("weak_open_interest");

  const tagsPresent = market.tags.length > 0;
  if (!tagsPresent) flags.push("missing_tags");
  if (market.restricted) flags.push("restricted_market");
  if (tagsPresent && !market.hasAleaTag) flags.push("not_in_alea_sectors");

  const fitScore = market.hasAleaTag ? weights.fit : 0;

  let penalty = 0;
  if (market.restricted) penalty += penalties.restricted;
  if (!tagsPresent) penalty += penalties.missing_tags;

  const totalScore = clamp(
    liqScore +
      volScore +
      oiScore +
      resolutionScore +
      endDateScore +
      fitScore +
      penalty,
    0,
    100
  );

  return {
    totalScore,
    components: {
      liquidity: liqScore,
      volume24h: volScore,
      openInterest: oiScore,
      resolutionSource: resolutionScore,
      endDate: endDateScore,
      fit: fitScore,
      penalties: penalty,
    },
    flags,
  };
};

const buildMarketRecord = (market, event, index, config, allowedTags, excludeTags) => {
  const id =
    market?.id ??
    market?.marketId ??
    market?.slug ??
    `${event?.id ?? "event"}:${index}`;
  const slug = market?.slug ?? market?.marketSlug ?? null;
  const eventSlug = event?.slug ?? event?.eventSlug ?? event?.event_slug ?? null;
  const question = market?.question ?? market?.title ?? event?.title ?? "Untitled market";
  const description = market?.description ?? event?.description ?? null;
  const resolutionSource =
    market?.resolutionSource ?? event?.resolutionSource ?? event?.resolution_source ?? null;
  const endDate = parseDate(
    market?.endDate ??
      market?.endTime ??
      market?.end_time ??
      event?.endDate ??
      event?.endTime ??
      event?.end_time ??
      event?.closeTime ??
      event?.close_time
  );

  const tags = normalizeTags(market?.tags ?? event?.tags);
  const tagSlugs = tags.map((tag) => tag.slug);

  const liquidity = pickFirstNumber(
    market?.liquidity,
    market?.liquidityUsd,
    event?.liquidity,
    0
  );
  const volume24h = pickFirstNumber(
    market?.volume24h,
    market?.volume24hr,
    market?.volume24Hour,
    event?.volume24h,
    event?.volume24hr,
    0
  );
  const openInterest = pickFirstNumber(
    market?.openInterest,
    market?.open_interest,
    event?.openInterest,
    0
  );
  const restricted = Boolean(market?.restricted ?? event?.restricted ?? false);
  const outcomes = market?.outcomes ?? market?.outcomeNames ?? market?.outcome_names ?? null;
  const outcomesCount = Array.isArray(outcomes) ? outcomes.length : 0;

  const hasAleaTag = tagSlugs.some((slugValue) => allowedTags.has(slugValue));
  const isExcluded = tagSlugs.some((slugValue) => excludeTags.has(slugValue));

  return {
    id: String(id),
    eventId: event?.id ? String(event.id) : null,
    slug,
    question,
    description,
    resolutionSource,
    endDate,
    liquidity: liquidity ?? 0,
    volume24h: volume24h ?? 0,
    openInterest: openInterest ?? 0,
    tags,
    outcomes,
    isMultiOutcome: outcomesCount > 2,
    restricted,
    marketUrl: buildMarketUrl(slug, eventSlug),
    isExcluded,
    rawPayload: { event: slimEventPayload(event), market },
    hasAleaTag,
  };
};

const createPrismaClient = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  return { prisma, pool };
};

export const runSync = async (options = {}) => {
  const startedAt = new Date();
  const configPath = options.configPath ?? CONFIG_PATH;
  const configRaw = await fs.readFile(configPath, "utf-8");
  const config = JSON.parse(configRaw);
  const allowedTags = buildAllowedTagSet(config);
  const excludeTags = buildExcludeTagSet(config);

  const { prisma, pool } = createPrismaClient();

  await prisma.syncStatus.upsert({
    where: { id: 1 },
    update: { lastAttemptedSyncAt: startedAt, lastError: null },
    create: { id: 1, lastAttemptedSyncAt: startedAt, lastError: null },
  });

  try {
    const events = await fetchAllEvents();
    const markets = [];

    events.forEach((event) => {
      const eventMarkets = Array.isArray(event?.markets) ? event.markets : [];
      if (!eventMarkets.length) return;
      eventMarkets.forEach((market, index) => {
        markets.push(buildMarketRecord(market, event, index, config, allowedTags, excludeTags));
      });
    });

    const liquidityValues = markets.map((market) => market.liquidity).filter((v) => v > 0);
    const volumeValues = markets.map((market) => market.volume24h).filter((v) => v > 0);
    const oiValues = markets.map((market) => market.openInterest).filter((v) => v > 0);

    const refs = {
      liquidity: percentile(liquidityValues, config.ref_percentile ?? 0.9),
      volume24h: percentile(volumeValues, config.ref_percentile ?? 0.9),
      openInterest: percentile(oiValues, config.ref_percentile ?? 0.9),
    };

    const now = new Date();
    let upserted = 0;

    for (const market of markets) {
      const score = scoreMarket(market, config, refs);
      await prisma.market.upsert({
        where: { id: market.id },
        update: {
          eventId: market.eventId,
          slug: market.slug,
          question: market.question,
          description: market.description,
          resolutionSource: market.resolutionSource,
          endDate: market.endDate,
          liquidity: market.liquidity,
          volume24h: market.volume24h,
          openInterest: market.openInterest,
          tags: market.tags,
          outcomes: market.outcomes,
          isMultiOutcome: market.isMultiOutcome,
          restricted: market.restricted,
          marketUrl: market.marketUrl,
          isExcluded: market.isExcluded,
          rawPayload: market.rawPayload,
          lastSeenAt: now,
        },
        create: {
          id: market.id,
          eventId: market.eventId,
          slug: market.slug,
          question: market.question,
          description: market.description,
          resolutionSource: market.resolutionSource,
          endDate: market.endDate,
          liquidity: market.liquidity,
          volume24h: market.volume24h,
          openInterest: market.openInterest,
          tags: market.tags,
          outcomes: market.outcomes,
          isMultiOutcome: market.isMultiOutcome,
          restricted: market.restricted,
          marketUrl: market.marketUrl,
          isExcluded: market.isExcluded,
          rawPayload: market.rawPayload,
          lastSeenAt: now,
        },
      });

      await prisma.score.upsert({
        where: { marketId: market.id },
        update: {
          totalScore: score.totalScore,
          components: score.components,
          flags: score.flags,
          scoreVersion: config.score_version ?? "v1",
          refs,
          computedAt: now,
        },
        create: {
          marketId: market.id,
          totalScore: score.totalScore,
          components: score.components,
          flags: score.flags,
          scoreVersion: config.score_version ?? "v1",
          refs,
          computedAt: now,
        },
      });

      await prisma.annotation.upsert({
        where: { marketId: market.id },
        update: {},
        create: { marketId: market.id },
      });

      upserted += 1;
    }

    await prisma.syncStatus.update({
      where: { id: 1 },
      data: {
        lastSuccessfulSyncAt: now,
        lastError: null,
        lastStats: { events: events.length, markets: upserted },
        lastRefs: refs,
      },
    });

    return {
      events: events.length,
      markets: upserted,
      refs,
      startedAt,
      finishedAt: new Date(),
    };
  } catch (error) {
    await prisma.syncStatus.update({
      where: { id: 1 },
      data: {
        lastError: error?.message ?? String(error),
      },
    });
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
};
