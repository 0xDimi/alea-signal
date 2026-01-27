import { NextResponse } from "next/server";

import config from "@/config/app-config.json";
import { getPrisma } from "@/app/lib/prisma";
import { loadMarketSnapshot } from "@/app/lib/snapshot";
import { getRuntimeSnapshot } from "@/app/lib/runtime-sync-cache";
import {
  daysToExpiry,
  expiryLabel,
  memoMode,
  normalizeTags,
  tagSlugs,
} from "@/app/lib/market-utils";

const DEFAULT_SORT = "score";

type SortableMarket = {
  score: number;
  liquidity: number;
  volume24h: number;
  openInterest: number | null;
  daysToExpiry: number | null;
};

const sorters: Record<string, (a: SortableMarket, b: SortableMarket) => number> = {
  score: (a, b) => (a.score ?? 0) - (b.score ?? 0),
  liquidity: (a, b) => a.liquidity - b.liquidity,
  volume24h: (a, b) => a.volume24h - b.volume24h,
  openInterest: (a, b) => (a.openInterest ?? 0) - (b.openInterest ?? 0),
  expiry: (a, b) => (a.daysToExpiry ?? Infinity) - (b.daysToExpiry ?? Infinity),
};

type MarketRow = {
  id: string;
  source?: string | null;
  question: string;
  description: string | null;
  endDate: Date | string | null;
  liquidity: number;
  volume24h: number;
  openInterest: number;
  tags: unknown;
  outcomes: unknown;
  restricted: boolean;
  isExcluded: boolean;
  marketUrl: string | null;
  score: {
    totalScore: number;
    components: unknown;
    flags: unknown;
  } | null;
  annotation: {
    state: string;
    notes: string | null;
    owner: string | null;
  } | null;
};

const resolveSource = (market: { source?: string | null; marketUrl?: string | null }) => {
  const explicit = market.source ? String(market.source).toLowerCase() : null;
  if (explicit === "kalshi" || explicit === "polymarket") return explicit;
  const url = market.marketUrl ?? "";
  if (url.includes("kalshi.com")) return "kalshi";
  return "polymarket";
};

const hasOwn = (value: unknown, key: string) =>
  Boolean(
    value &&
      typeof value === "object" &&
      Object.prototype.hasOwnProperty.call(value as Record<string, unknown>, key)
  );

const hasOpenInterest = (payload: unknown, openInterest: number | null) => {
  if (!payload || typeof payload !== "object") {
    return openInterest !== null && Number.isFinite(openInterest);
  }
  const raw = payload as { event?: unknown; market?: unknown };
  const market = raw.market ?? payload;
  const event = raw.event ?? payload;
  const keys = [
    "openInterest",
    "open_interest",
    "openInterestUsd",
    "open_interest_usd",
    "openInterestUSD",
  ];
  return (
    keys.some((key) => hasOwn(market, key)) || keys.some((key) => hasOwn(event, key))
  );
};

const isActiveMarket = (
  payload: unknown,
  endDate?: Date | string | null
) => {
  if (!payload || typeof payload !== "object") {
    if (!endDate) return true;
    const date =
      typeof endDate === "string" ? new Date(endDate) : endDate;
    return date.getTime() >= Date.now();
  }
  const raw = payload as { event?: unknown; market?: unknown };
  const market = raw.market ?? payload;
  const event = raw.event ?? payload;
  const closed =
    (typeof market === "object" && market && "closed" in market && (market as any).closed) ||
    (typeof event === "object" && event && "closed" in event && (event as any).closed) ||
    (typeof market === "object" &&
      market &&
      "resolved" in market &&
      (market as any).resolved) ||
    (typeof event === "object" && event && "resolved" in event && (event as any).resolved);
  if (closed) return false;
  const marketActive =
    typeof market === "object" && market && "active" in market ? (market as any).active : true;
  const eventActive =
    typeof event === "object" && event && "active" in event ? (event as any).active : true;
  return marketActive !== false && eventActive !== false;
};

const buildAllowedTagSet = (sectorsOverride?: string[]) => {
  const allowed = new Set<string>();
  const sectors = (sectorsOverride?.length
    ? sectorsOverride
    : (config.allowed_sectors ?? [])) as string[];
  const map = (config.sector_map ?? {}) as Record<string, string[]>;
  sectors.forEach((sector) => {
    const tags = map[sector] ?? [];
    tags.forEach((tag) => allowed.add(String(tag).toLowerCase()));
  });
  return allowed;
};

const resolveSelectedSectors = (searchParams: URLSearchParams) => {
  const raw = searchParams.get("sectors");
  const available = (config.allowed_sectors ?? []).map((sector) =>
    String(sector).toLowerCase()
  );
  if (!raw) return available;
  const selected = raw
    .split(",")
    .map((sector) => sector.trim().toLowerCase())
    .filter((sector) => sector.length > 0 && available.includes(sector));
  return selected.length ? selected : available;
};

const resolveMinOutcomeProbability = (
  searchParams: URLSearchParams,
  fallback: number
) => {
  const raw = searchParams.get("minOutcomeProbability");
  if (!raw) return fallback;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return fallback;
  const normalized = numeric > 1 ? numeric / 100 : numeric;
  return Math.min(1, Math.max(0, normalized));
};

type OutcomeSummary = {
  total: number;
  aboveThreshold: number;
  maxProbability: number | null;
  topOutcome: { name: string | null; probability: number } | null;
};

const normalizeProbability = (value: number) =>
  Number.isFinite(value) ? (value > 1 ? value / 100 : value) : null;

const normalizeOutcomeProbability = (outcome: unknown) => {
  if (typeof outcome === "number") {
    const normalizedProbability = normalizeProbability(outcome);
    if (normalizedProbability === null) return null;
    return { name: null, probability: outcome, normalizedProbability };
  }
  if (!outcome || typeof outcome !== "object") return null;
  const record = outcome as Record<string, unknown>;
  const candidate = record.probability ?? record.price ?? record.value;
  const numeric = Number(candidate);
  if (!Number.isFinite(numeric)) return null;
  const normalizedProbability = normalizeProbability(numeric);
  if (normalizedProbability === null) return null;
  const name =
    typeof record.name === "string"
      ? record.name
      : typeof record.title === "string"
        ? record.title
        : typeof record.outcome === "string"
          ? record.outcome
          : null;
  return { name, probability: numeric, normalizedProbability };
};

const summarizeOutcomes = (outcomes: unknown, minProbability: number): OutcomeSummary => {
  if (!Array.isArray(outcomes) || outcomes.length === 0) {
    return { total: 0, aboveThreshold: 0, maxProbability: null, topOutcome: null };
  }
  const normalized = outcomes
    .map(normalizeOutcomeProbability)
    .filter(
      (
        value
      ): value is {
        name: string | null;
        probability: number;
        normalizedProbability: number;
      } => Boolean(value)
    );
  if (!normalized.length) {
    return { total: 0, aboveThreshold: 0, maxProbability: null, topOutcome: null };
  }
  const sorted = [...normalized].sort(
    (a, b) => b.normalizedProbability - a.normalizedProbability
  );
  const top = sorted[0];
  const aboveThreshold = normalized.filter(
    (item) => item.normalizedProbability >= minProbability
  ).length;
  return {
    total: normalized.length,
    aboveThreshold,
    maxProbability: top.normalizedProbability,
    topOutcome: { name: top.name ?? null, probability: top.probability },
  };
};

const loadAnnotations = async (marketIds: string[]) => {
  if (!marketIds.length) return null;
  try {
    const prisma = getPrisma();
    const annotations = await prisma.annotation.findMany({
      where: { marketId: { in: marketIds } },
      select: { marketId: true, state: true, notes: true, owner: true },
    });
    const map = new Map<string, MarketRow["annotation"]>();
    annotations.forEach((annotation) => {
      map.set(annotation.marketId, {
        state: annotation.state,
        notes: annotation.notes,
        owner: annotation.owner,
      });
    });
    return map;
  } catch (error) {
    console.error("Annotation lookup failed", error);
    return null;
  }
};

export const GET = async (request: Request) => {
  try {
    const { searchParams } = new URL(request.url);
    const mode = (searchParams.get("mode") ?? "all").toLowerCase();
    const minScore = Number(searchParams.get("minScore") ?? 0);
    const sort = (searchParams.get("sort") ?? DEFAULT_SORT) as keyof typeof sorters;
    const order = (searchParams.get("order") ?? "desc").toLowerCase();
    const minDays = Number(searchParams.get("minDays") ?? Number.NEGATIVE_INFINITY);
    const maxDays = Number(searchParams.get("maxDays") ?? Number.POSITIVE_INFINITY);
    const sourceFilter = (searchParams.get("source") ?? "all").toLowerCase();
    const hideRestricted = searchParams.get("hideRestricted") === "true";
    const includeExcluded = searchParams.get("includeExcluded") === "true";
    const minOutcomeProbability = resolveMinOutcomeProbability(
      searchParams,
      config.min_outcome_probability ?? 0.01
    );
    const tags = (searchParams.get("tags") ?? "")
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
    const selectedSectors = resolveSelectedSectors(searchParams);
    const allowedTagSet = buildAllowedTagSet(selectedSectors);

    const snapshot = await loadMarketSnapshot();
    const maxSnapshotAgeMs = Number(
      process.env.SNAPSHOT_MAX_AGE_MS ?? 6 * 60 * 60 * 1000
    );
    const snapshotAgeMs =
      snapshot?.generatedAt && !Number.isNaN(new Date(snapshot.generatedAt).getTime())
        ? Date.now() - new Date(snapshot.generatedAt).getTime()
        : Number.POSITIVE_INFINITY;
    const snapshotHasKalshi = snapshot?.markets?.some(
      (market) =>
        String(market.source ?? "")
          .toLowerCase()
          .includes("kalshi") || String(market.marketUrl ?? "").includes("kalshi.com")
    );
    const snapshotStale =
      !snapshot?.markets?.length ||
      !Number.isFinite(maxSnapshotAgeMs) ||
      snapshotAgeMs > maxSnapshotAgeMs ||
      (sourceFilter === "kalshi" && !snapshotHasKalshi);
    let markets: MarketRow[] = [];
    let usedSnapshot = false;

    if (!snapshotStale && snapshot?.markets?.length) {
      usedSnapshot = true;
      markets = snapshot.markets.map((market) => ({
        ...market,
        score: market.score ?? null,
        annotation: null,
      }));
      const annotationMap = await loadAnnotations(
        markets.map((market) => market.id)
      );
      if (annotationMap) {
        markets = markets.map((market) => ({
          ...market,
          annotation: annotationMap.get(market.id) ?? null,
        }));
      }
    } else {
      const runtimeSnapshot = await getRuntimeSnapshot();
      if (runtimeSnapshot?.markets?.length) {
        usedSnapshot = true;
        markets = runtimeSnapshot.markets.map((market) => ({
          ...market,
          score: market.score ?? null,
          annotation: null,
        }));
        const annotationMap = await loadAnnotations(
          markets.map((market) => market.id)
        );
        if (annotationMap) {
          markets = markets.map((market) => ({
            ...market,
            annotation: annotationMap.get(market.id) ?? null,
          }));
        }
      }
    }

    if (!markets.length) {
      const prisma = getPrisma();
      markets = await prisma.market.findMany({
        select: {
          id: true,
          question: true,
          description: true,
          endDate: true,
          liquidity: true,
          volume24h: true,
          openInterest: true,
          tags: true,
          outcomes: true,
          restricted: true,
          isExcluded: true,
          marketUrl: true,
          score: {
            select: {
              totalScore: true,
              components: true,
              flags: true,
            },
          },
          annotation: {
            select: {
              state: true,
              notes: true,
              owner: true,
            },
          },
        },
      });
    }

    const memoMaxDays = config.memo_max_days ?? 30;
    const minDaysToExpiry = config.min_days_to_expiry ?? 0;

    const hydrated = markets.map((market) => {
      const days = daysToExpiry(market.endDate);
      const expiry = expiryLabel(market.endDate);
      const modeLabel = memoMode(days, memoMaxDays, minDaysToExpiry);
      const flags = Array.isArray(market.score?.flags)
        ? market.score.flags.filter((flag) => flag !== "restricted_market")
        : [];
      const components =
        market.score?.components && typeof market.score.components === "object"
          ? market.score.components
          : {};
      const openInterest = hasOpenInterest(null, market.openInterest)
        ? market.openInterest
        : null;
      const active = isActiveMarket(null, market.endDate);
      const outcomesSummary = summarizeOutcomes(
        market.outcomes,
        minOutcomeProbability
      );
      const lowProbability =
        outcomesSummary.maxProbability === null ||
        outcomesSummary.maxProbability < minOutcomeProbability;
      const slugs = tagSlugs(market.tags);
      const hasAllowedTag = slugs.some((slug) => allowedTagSet.has(slug));
      const source = resolveSource(market);
      return {
        ...market,
        source,
        daysToExpiry: days,
        expiryLabel: expiry,
        mode: modeLabel,
        score: market.score?.totalScore ?? 0,
        scoreComponents: components,
        flags,
        tags: normalizeTags(market.tags),
        tagSlugs: slugs,
        openInterest,
        isActive: active,
        restricted: false,
        hasAllowedTag,
        lowProbability,
        outcomesSummary: {
          total: outcomesSummary.total,
          aboveThreshold: outcomesSummary.aboveThreshold,
          threshold: minOutcomeProbability,
          topOutcome: outcomesSummary.topOutcome,
        },
      };
    });

    const filtered = hydrated.filter((market) => {
      if (
        sourceFilter !== "all" &&
        sourceFilter !== market.source?.toLowerCase()
      ) {
        return false;
      }
      if (!includeExcluded && market.isExcluded) return false;
      if (hideRestricted && market.restricted) return false;
      if (!market.hasAllowedTag) return false;
      if (market.lowProbability) return false;
      if (Number.isFinite(minScore) && market.score < minScore) return false;
      if (mode !== "all" && market.mode.toLowerCase() !== mode) return false;
      if (!market.isActive) return false;
      if (market.daysToExpiry !== null && market.daysToExpiry < 0) return false;
      if (
        Number.isFinite(minDaysToExpiry) &&
        market.daysToExpiry !== null &&
        market.daysToExpiry < minDaysToExpiry
      ) {
        return false;
      }
      if (
        Number.isFinite(minDays) &&
        market.daysToExpiry !== null &&
        market.daysToExpiry < minDays
      ) {
        return false;
      }
      if (
        Number.isFinite(maxDays) &&
        market.daysToExpiry !== null &&
        market.daysToExpiry > maxDays
      ) {
        return false;
      }
      if (tags.length > 0 && !tags.some((tag) => market.tagSlugs.includes(tag))) {
        return false;
      }
      return true;
    });

    const sorter = sorters[sort] ?? sorters[DEFAULT_SORT];
    const sorted = [...filtered]
      .map(({ isActive, hasAllowedTag, lowProbability, ...market }) => market)
      .sort(sorter);
    if (order === "desc") sorted.reverse();

    const response = NextResponse.json({ markets: sorted });
    if (usedSnapshot) {
      response.headers.set("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    }
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
