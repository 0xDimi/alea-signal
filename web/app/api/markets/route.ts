import { NextResponse } from "next/server";

import config from "@/config/app-config.json";
import { prisma } from "@/app/lib/prisma";
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
  question: string;
  description: string | null;
  endDate: Date | null;
  liquidity: number;
  volume24h: number;
  openInterest: number;
  tags: unknown;
  restricted: boolean;
  isExcluded: boolean;
  marketUrl: string | null;
  rawPayload: unknown;
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

const hasOwn = (value: unknown, key: string) =>
  Boolean(
    value &&
      typeof value === "object" &&
      Object.prototype.hasOwnProperty.call(value as Record<string, unknown>, key)
  );

const hasOpenInterest = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return false;
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

const isActiveMarket = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return true;
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

const buildAllowedTagSet = () => {
  const allowed = new Set<string>();
  const sectors = (config.allowed_sectors ?? []) as string[];
  const map = (config.sector_map ?? {}) as Record<string, string[]>;
  sectors.forEach((sector) => {
    const tags = map[sector] ?? [];
    tags.forEach((tag) => allowed.add(String(tag).toLowerCase()));
  });
  return allowed;
};

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const mode = (searchParams.get("mode") ?? "all").toLowerCase();
  const minScore = Number(searchParams.get("minScore") ?? 0);
  const sort = (searchParams.get("sort") ?? DEFAULT_SORT) as keyof typeof sorters;
  const order = (searchParams.get("order") ?? "desc").toLowerCase();
  const minDays = Number(searchParams.get("minDays") ?? Number.NEGATIVE_INFINITY);
  const maxDays = Number(searchParams.get("maxDays") ?? Number.POSITIVE_INFINITY);
  const hideRestricted = searchParams.get("hideRestricted") === "true";
  const includeExcluded = searchParams.get("includeExcluded") === "true";
  const tags = (searchParams.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  const allowedTagSet = buildAllowedTagSet();

  const markets: MarketRow[] = await prisma.market.findMany({
    select: {
      id: true,
      question: true,
      description: true,
      endDate: true,
      liquidity: true,
      volume24h: true,
      openInterest: true,
      tags: true,
      restricted: true,
      isExcluded: true,
      marketUrl: true,
      rawPayload: true,
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
    const openInterest = hasOpenInterest(market.rawPayload)
      ? market.openInterest
      : null;
    const active = isActiveMarket(market.rawPayload);
    const slugs = tagSlugs(market.tags);
    const hasAllowedTag = slugs.some((slug) => allowedTagSet.has(slug));
    return {
      ...market,
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
    };
  });

  const filtered = hydrated.filter((market) => {
    if (!includeExcluded && market.isExcluded) return false;
    if (hideRestricted && market.restricted) return false;
    if (!market.hasAllowedTag) return false;
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
    if (Number.isFinite(minDays) && market.daysToExpiry !== null && market.daysToExpiry < minDays) {
      return false;
    }
    if (Number.isFinite(maxDays) && market.daysToExpiry !== null && market.daysToExpiry > maxDays) {
      return false;
    }
    if (tags.length > 0 && !tags.some((tag) => market.tagSlugs.includes(tag))) {
      return false;
    }
    return true;
  });

  const sorter = sorters[sort] ?? sorters[DEFAULT_SORT];
  const sorted = [...filtered]
    .map(({ isActive, rawPayload, hasAllowedTag, ...market }) => market)
    .sort(sorter);
  if (order === "desc") sorted.reverse();

  return NextResponse.json({
    markets: sorted,
  });
};
