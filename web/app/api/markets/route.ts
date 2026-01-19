import { NextResponse } from "next/server";

import config from "@/config/app-config.json";
import { prisma } from "@/app/lib/prisma";
import { daysToExpiry, memoMode, normalizeTags, tagSlugs } from "@/app/lib/market-utils";

const DEFAULT_SORT = "score";

type SortableMarket = {
  score: number;
  liquidity: number;
  volume24h: number;
  openInterest: number;
  daysToExpiry: number | null;
};

const sorters: Record<string, (a: SortableMarket, b: SortableMarket) => number> = {
  score: (a, b) => (a.score ?? 0) - (b.score ?? 0),
  liquidity: (a, b) => a.liquidity - b.liquidity,
  volume24h: (a, b) => a.volume24h - b.volume24h,
  openInterest: (a, b) => a.openInterest - b.openInterest,
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

  const hydrated = markets.map((market) => {
    const days = daysToExpiry(market.endDate);
    const modeLabel = memoMode(days, memoMaxDays);
    const flags = Array.isArray(market.score?.flags) ? market.score?.flags : [];
    const components =
      market.score?.components && typeof market.score.components === "object"
        ? market.score.components
        : {};
    return {
      ...market,
      daysToExpiry: days,
      mode: modeLabel,
      score: market.score?.totalScore ?? 0,
      scoreComponents: components,
      flags,
      tags: normalizeTags(market.tags),
      tagSlugs: tagSlugs(market.tags),
    };
  });

  const filtered = hydrated.filter((market) => {
    if (!includeExcluded && market.isExcluded) return false;
    if (hideRestricted && market.restricted) return false;
    if (Number.isFinite(minScore) && market.score < minScore) return false;
    if (mode !== "all" && market.mode.toLowerCase() !== mode) return false;
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
  const sorted = [...filtered].sort(sorter);
  if (order === "desc") sorted.reverse();

  return NextResponse.json({
    markets: sorted,
  });
};
