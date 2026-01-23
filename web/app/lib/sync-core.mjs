import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const CONFIG_PATH = path.join(process.cwd(), "config/app-config.json");
const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.NEON_DATABASE_URL;
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

const daysToExpiry = (endDate) => {
  if (!endDate) return null;
  const date = endDate instanceof Date ? endDate : new Date(endDate);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = date.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
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

const normalizeOutcomeName = (value) => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if ("name" in value) return String(value.name);
    if ("title" in value) return String(value.title);
    if ("outcome" in value) return String(value.outcome);
  }
  return null;
};

const normalizeOutcomePrices = (prices) => {
  if (!Array.isArray(prices)) return [];
  return prices.map((price) => safeNumber(price));
};

const hasOwn = (value, key) =>
  Boolean(value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key));

const hasAnyField = (value, keys) => keys.some((key) => hasOwn(value, key));

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
    resolutionIntegrity: 30,
    liquidityMicrostructure: 25,
    modelability: 20,
    participationQuality: 15,
    strategicFit: 10,
    ...(config.weights ?? {}),
  };
  const penalties = { restricted: -10, missing_tags: -5, ...(config.penalties ?? {}) };
  const thresholds = {
    min_liquidity: 0,
    min_volume24h: 0,
    min_open_interest: 0,
    ...(config.flags_thresholds ?? {}),
  };
  const minDaysToExpiry = config.min_days_to_expiry ?? 0;
  const flags = [];

  const hasResolutionSource = Boolean(market.resolutionSource);
  const hasEndDate = Boolean(market.endDate);
  const tagsPresent = market.tags.length > 0;
  const days = daysToExpiry(market.endDate);

  const resolutionIntegrity =
    weights.resolutionIntegrity *
    (Number(hasResolutionSource) * 0.6 + Number(hasEndDate) * 0.4);

  const liqScore = logScore(
    market.liquidity,
    refs.liquidity,
    weights.liquidityMicrostructure * 0.6
  );
  const volScore = logScore(
    market.volume24h,
    refs.volume24h,
    weights.liquidityMicrostructure * 0.3
  );
  const oiScore = logScore(
    market.openInterest,
    refs.openInterest,
    weights.liquidityMicrostructure * 0.1
  );
  const liquidityMicrostructure = clamp(
    liqScore + volScore + oiScore,
    0,
    weights.liquidityMicrostructure
  );

  const modelabilitySignals =
    (tagsPresent ? 0.5 : 0) + (hasResolutionSource ? 0.3 : 0) + (hasEndDate ? 0.2 : 0);
  const modelability = weights.modelability * modelabilitySignals;

  const participationValue =
    market.openInterest > 0 ? market.openInterest : market.volume24h;
  const participationRef =
    market.openInterest > 0 ? refs.openInterest : refs.volume24h;
  const participationQuality = logScore(
    participationValue,
    participationRef,
    weights.participationQuality
  );

  const strategicFit = market.hasAleaTag ? weights.strategicFit : 0;

  if (market.hasResolutionSourceField && !hasResolutionSource) {
    flags.push("missing_resolution_source");
  }
  if (!hasEndDate) flags.push("missing_end_date");
  if (market.liquidity < thresholds.min_liquidity) flags.push("low_liquidity");
  if (
    market.volume24h < thresholds.min_volume24h &&
    market.liquidity < thresholds.min_liquidity
  ) {
    flags.push("low_volume24h");
  }
  if (
    market.hasOpenInterestField &&
    market.openInterest < thresholds.min_open_interest
  ) {
    flags.push("weak_open_interest");
  }
  if (days !== null && days < minDaysToExpiry) flags.push("too_short_horizon");
  if (!tagsPresent) flags.push("missing_tags");
  if (market.restricted) flags.push("restricted_market");
  if (tagsPresent && !market.hasAleaTag) flags.push("not_in_alea_sectors");

  let penalty = 0;
  if (market.restricted) penalty += penalties.restricted;
  if (!tagsPresent) penalty += penalties.missing_tags;
  if (days !== null && days < minDaysToExpiry) penalty += penalties.too_short_horizon ?? 0;

  const totalScore = clamp(
    resolutionIntegrity +
      liquidityMicrostructure +
      modelability +
      participationQuality +
      strategicFit +
      penalty,
    0,
    100
  );

  return {
    totalScore,
    components: {
      resolutionIntegrity,
      liquidityMicrostructure,
      modelability,
      participationQuality,
      strategicFit,
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
    market?.openInterestUsd,
    market?.open_interest_usd,
    market?.openInterestUSD,
    event?.openInterest,
    0
  );
  const restricted = false;
  const openInterestKeys = [
    "openInterest",
    "open_interest",
    "openInterestUsd",
    "open_interest_usd",
    "openInterestUSD",
  ];
  const resolutionSourceKeys = ["resolutionSource", "resolution_source"];
  const hasOpenInterestField =
    hasAnyField(market, openInterestKeys) || hasAnyField(event, openInterestKeys);
  const hasResolutionSourceField =
    hasAnyField(market, resolutionSourceKeys) || hasAnyField(event, resolutionSourceKeys);

  const outcomeEntries =
    market?.outcomes ?? market?.outcomeNames ?? market?.outcome_names ?? null;
  const outcomePricesRaw =
    market?.outcomePrices ??
    market?.outcome_prices ??
    market?.outcomeTokenPrices ??
    market?.outcome_token_prices ??
    null;
  const outcomeList = Array.isArray(outcomeEntries) ? outcomeEntries : [];
  const outcomeNames = outcomeList.map(normalizeOutcomeName).filter(Boolean);
  const outcomePrices = normalizeOutcomePrices(outcomePricesRaw);
  const outcomes = outcomeNames.length
    ? outcomeList
        .map((entry, idx) => {
          const name = normalizeOutcomeName(entry);
          if (!name) return null;
          const entryProbability =
            entry && typeof entry === "object"
              ? safeNumber(
                  entry.probability ??
                    entry.price ??
                    entry.outcomePrice ??
                    entry.value
                )
              : null;
          const probability =
            entryProbability ??
            (idx < outcomePrices.length ? outcomePrices[idx] : null);
          return probability === null ? { name } : { name, probability };
        })
        .filter(Boolean)
    : null;
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
    hasOpenInterestField,
    hasResolutionSourceField,
  };
};

const createPrismaClient = () => {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
  }
  const pool = new Pool({ connectionString: DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  return { prisma, pool };
};

const mergeScoreConfig = (fileConfig, dbConfig) => {
  if (!dbConfig) return fileConfig;
  const merged = { ...fileConfig };
  if (dbConfig.weights && typeof dbConfig.weights === "object") {
    merged.weights = dbConfig.weights;
  }
  if (dbConfig.penalties && typeof dbConfig.penalties === "object") {
    merged.penalties = dbConfig.penalties;
  }
  if (dbConfig.flagsThresholds && typeof dbConfig.flagsThresholds === "object") {
    merged.flags_thresholds = dbConfig.flagsThresholds;
  }
  if (Number.isFinite(dbConfig.refPercentile)) {
    merged.ref_percentile = dbConfig.refPercentile;
  }
  if (Number.isFinite(dbConfig.memoMaxDays)) {
    merged.memo_max_days = dbConfig.memoMaxDays;
  }
  if (typeof dbConfig.scoreVersion === "string" && dbConfig.scoreVersion) {
    merged.score_version = dbConfig.scoreVersion;
  }
  return merged;
};

export const runSync = async (options = {}) => {
  const startedAt = new Date();
  const configPath = options.configPath ?? CONFIG_PATH;
  const configRaw = await fs.readFile(configPath, "utf-8");
  const fileConfig = JSON.parse(configRaw);

  const { prisma, pool } = createPrismaClient();
  const dbConfig = await prisma.scoreConfig.findUnique({ where: { id: 1 } });
  const config = mergeScoreConfig(fileConfig, dbConfig);
  const allowedTags = buildAllowedTagSet(config);
  const excludeTags = buildExcludeTagSet(config);

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

    const marketLimit = config.sync_market_limit ?? null;
    const marketsToProcess =
      Number.isFinite(marketLimit) && marketLimit > 0 && markets.length > marketLimit
        ? [...markets]
            .sort(
              (a, b) =>
                b.liquidity - a.liquidity ||
                b.volume24h - a.volume24h ||
                b.openInterest - a.openInterest
            )
            .slice(0, marketLimit)
        : markets;

    const liquidityValues = marketsToProcess
      .map((market) => market.liquidity)
      .filter((v) => v > 0);
    const volumeValues = marketsToProcess
      .map((market) => market.volume24h)
      .filter((v) => v > 0);
    const oiValues = marketsToProcess
      .map((market) => market.openInterest)
      .filter((v) => v > 0);

    const refs = {
      liquidity: percentile(liquidityValues, config.ref_percentile ?? 0.9),
      volume24h: percentile(volumeValues, config.ref_percentile ?? 0.9),
      openInterest: percentile(oiValues, config.ref_percentile ?? 0.9),
    };

    const now = new Date();
    const batchSize = config.sync_batch_size ?? 25;
    let upserted = 0;

    for (let index = 0; index < marketsToProcess.length; index += batchSize) {
      const batch = marketsToProcess.slice(index, index + batchSize);
      await Promise.all(
        batch.map(async (market) => {
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
              scoreVersion: config.score_version ?? "v2",
              refs,
              computedAt: now,
            },
            create: {
              marketId: market.id,
              totalScore: score.totalScore,
              components: score.components,
              flags: score.flags,
              scoreVersion: config.score_version ?? "v2",
              refs,
              computedAt: now,
            },
          });

          await prisma.scoreHistory.create({
            data: {
              marketId: market.id,
              totalScore: score.totalScore,
              components: score.components,
              flags: score.flags,
              scoreVersion: config.score_version ?? "v2",
              refs,
              computedAt: now,
            },
          });

          await prisma.annotation.upsert({
            where: { marketId: market.id },
            update: {},
            create: { marketId: market.id },
          });
        })
      );
      upserted += batch.length;
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
