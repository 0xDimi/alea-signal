import { NextResponse } from "next/server";

import { getPrisma } from "@/app/lib/prisma";
import { loadMarketSnapshot } from "@/app/lib/snapshot";
import { getRuntimeSnapshot } from "@/app/lib/runtime-sync-cache";
import {
  daysToExpiry,
  expiryLabel,
  memoMode,
  normalizeTags,
} from "@/app/lib/market-utils";
import config from "@/config/app-config.json";

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

type NormalizedOutcome = { name: string; probability?: number | null };

type MarketRecord = {
  id: string;
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
  rawPayload?: unknown;
  annotation?: unknown;
  score?: unknown;
};

const normalizeOutcome = (value: unknown): NormalizedOutcome | null => {
  if (typeof value === "string") return { name: value };
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name =
    typeof record.name === "string"
      ? record.name
      : typeof record.title === "string"
        ? record.title
        : typeof record.outcome === "string"
          ? record.outcome
          : null;
  if (!name) return null;
  const probability = Number.isFinite(Number(record.probability))
    ? Number(record.probability)
    : Number.isFinite(Number(record.price))
      ? Number(record.price)
      : null;
  return probability === null ? { name } : { name, probability };
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

const normalizeProbability = (value: number) =>
  Number.isFinite(value) ? (value > 1 ? value / 100 : value) : null;

const summarizeOutcomes = (
  outcomes: { name: string; probability?: number | null }[],
  threshold: number
) => {
  const normalized = outcomes.map((outcome) => {
    const probability =
      typeof outcome.probability === "number" && Number.isFinite(outcome.probability)
        ? outcome.probability
        : null;
    const normalizedProbability =
      probability === null ? null : normalizeProbability(probability);
    return { ...outcome, probability, normalizedProbability };
  });

  const withProbability = normalized.filter(
    (outcome) => outcome.normalizedProbability !== null
  );
  const topOutcome = [...withProbability].sort(
    (a, b) => (b.normalizedProbability ?? 0) - (a.normalizedProbability ?? 0)
  )[0];

  const shown = normalized
    .filter(
      (outcome) =>
        outcome.normalizedProbability === null ||
        (outcome.normalizedProbability ?? 0) >= threshold
    )
    .sort((a, b) => {
      if (a.normalizedProbability === null && b.normalizedProbability === null) return 0;
      if (a.normalizedProbability === null) return 1;
      if (b.normalizedProbability === null) return -1;
      return b.normalizedProbability - a.normalizedProbability;
    })
    .map(({ normalizedProbability, ...outcome }) => outcome);

  return {
    shown,
    summary: {
      total: normalized.length,
      shown: shown.length,
      hidden: Math.max(0, normalized.length - shown.length),
      threshold,
      topOutcome: topOutcome
        ? { name: topOutcome.name, probability: topOutcome.probability }
        : null,
    },
  };
};

export const GET = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { searchParams } = new URL(request.url);
    const { id: marketId } = await params;
    if (!marketId) {
      return NextResponse.json({ error: "Missing market id." }, { status: 400 });
    }

    const snapshot = await loadMarketSnapshot();
    const maxSnapshotAgeMs = Number(
      process.env.SNAPSHOT_MAX_AGE_MS ?? 6 * 60 * 60 * 1000
    );
    const snapshotAgeMs =
      snapshot?.generatedAt && !Number.isNaN(new Date(snapshot.generatedAt).getTime())
        ? Date.now() - new Date(snapshot.generatedAt).getTime()
        : Number.POSITIVE_INFINITY;
    const snapshotStale =
      !snapshot?.markets?.length ||
      !Number.isFinite(maxSnapshotAgeMs) ||
      snapshotAgeMs > maxSnapshotAgeMs;
    const snapshotMarket = !snapshotStale
      ? snapshot?.markets?.find((market) => market.id === marketId)
      : undefined;
    let prisma: ReturnType<typeof getPrisma> | null = null;
    let market: MarketRecord | null = null;
    let rawPayload: unknown = null;
    let annotation: unknown = null;
    let score: unknown = null;
    let researchPack: unknown = null;
    let scoreHistory: unknown = null;

    try {
      prisma = getPrisma();
    } catch (error) {
      prisma = null;
    }

    if (prisma) {
      try {
        const dbMarket = await prisma.market.findUnique({
          where: { id: marketId },
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
            outcomes: true,
            rawPayload: true,
            score: true,
            annotation: true,
          },
        });
        if (dbMarket) {
          market = dbMarket;
          rawPayload = dbMarket.rawPayload;
          annotation = dbMarket.annotation;
          score = dbMarket.score;
        }
      } catch (error) {
        prisma = null;
      }
    }

    if (!market && snapshotMarket) {
      const { score: snapshotScore, ...rest } = snapshotMarket;
      market = rest as MarketRecord;
      score = snapshotScore ?? null;
    }

    if (!market && snapshotStale) {
      const runtimeSnapshot = await getRuntimeSnapshot();
      const runtimeMarket = runtimeSnapshot?.markets?.find(
        (item) => item.id === marketId
      );
      if (runtimeMarket) {
        const { score: runtimeScore, ...rest } = runtimeMarket;
        market = rest as MarketRecord;
        score = runtimeScore ?? null;
      }
    }

    if (!market) {
      return NextResponse.json({ error: "Market not found." }, { status: 404 });
    }

    const { rawPayload: rawPayloadField, ...payload } = market;
    if (rawPayloadField && !rawPayload) {
      rawPayload = rawPayloadField;
    }
    const days = daysToExpiry(payload.endDate);
    const expiry = expiryLabel(payload.endDate);
    const minDaysToExpiry = config.min_days_to_expiry ?? 0;
    const openInterest = rawPayload
      ? hasOpenInterest(rawPayload)
        ? payload.openInterest
        : null
      : Number.isFinite(payload.openInterest)
        ? payload.openInterest
        : null;
    const outcomesRaw = Array.isArray(payload.outcomes)
      ? payload.outcomes
          .map(normalizeOutcome)
          .filter((outcome): outcome is NormalizedOutcome => Boolean(outcome))
      : [];
    const minOutcomeProbability = resolveMinOutcomeProbability(
      searchParams,
      config.min_outcome_probability ?? 0.01
    );
    const outcomesSummary = summarizeOutcomes(outcomesRaw, minOutcomeProbability);

    const scoreRecord =
      score && typeof score === "object" ? (score as Record<string, unknown>) : null;
    const rawFlags = scoreRecord?.flags;
    const filteredFlags = Array.isArray(rawFlags)
      ? rawFlags.filter((flag) => flag !== "restricted_market")
      : [];
    const normalizedScore = scoreRecord
      ? { ...scoreRecord, flags: filteredFlags }
      : null;

    if (prisma) {
      try {
        researchPack = await prisma.researchPack.findUnique({
          where: { marketId },
        });
        scoreHistory = await prisma.scoreHistory.findMany({
          where: { marketId },
          orderBy: { computedAt: "desc" },
          take: 5,
          select: {
            totalScore: true,
            computedAt: true,
            scoreVersion: true,
          },
        });
      } catch (error) {
        researchPack = null;
        scoreHistory = [];
      }
    }

    return NextResponse.json({
      ...payload,
      score: normalizedScore,
      openInterest,
      tags: normalizeTags(payload.tags),
      outcomes: outcomesSummary.shown,
      outcomesSummary: outcomesSummary.summary,
      annotation,
      researchPack,
      scoreHistory,
      daysToExpiry: days,
      expiryLabel: expiry,
      mode: memoMode(days, config.memo_max_days ?? 30, minDaysToExpiry),
      restricted: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
