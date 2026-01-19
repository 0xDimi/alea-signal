import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
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

const normalizeOutcome = (value: unknown) => {
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

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: marketId } = await params;
  if (!marketId) {
    return NextResponse.json({ error: "Missing market id." }, { status: 400 });
  }

  const market = await prisma.market.findUnique({
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
      marketUrl: true,
      outcomes: true,
      rawPayload: true,
      score: true,
      annotation: true,
    },
  });

  if (!market) {
    return NextResponse.json({ error: "Market not found." }, { status: 404 });
  }

  const { rawPayload, ...payload } = market;
  const days = daysToExpiry(payload.endDate);
  const expiry = expiryLabel(payload.endDate);
  const minDaysToExpiry = config.min_days_to_expiry ?? 0;
  const openInterest = hasOpenInterest(rawPayload)
    ? payload.openInterest
    : null;
  const outcomes = Array.isArray(payload.outcomes)
    ? payload.outcomes.map(normalizeOutcome).filter(Boolean)
    : [];

  const score = market.score
    ? {
        ...market.score,
        flags: Array.isArray(market.score.flags)
          ? market.score.flags.filter((flag) => flag !== "restricted_market")
          : [],
      }
    : null;

  const researchPack = await prisma.researchPack.findUnique({
    where: { marketId },
  });

  const scoreHistory = await prisma.scoreHistory.findMany({
    where: { marketId },
    orderBy: { computedAt: "desc" },
    take: 5,
    select: {
      totalScore: true,
      computedAt: true,
      scoreVersion: true,
    },
  });

  return NextResponse.json({
    ...payload,
    score,
    openInterest,
    tags: normalizeTags(payload.tags),
    outcomes,
    researchPack,
    scoreHistory,
    daysToExpiry: days,
    expiryLabel: expiry,
    mode: memoMode(days, config.memo_max_days ?? 30, minDaysToExpiry),
    restricted: false,
  });
};
