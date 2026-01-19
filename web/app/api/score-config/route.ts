import { NextResponse } from "next/server";

import config from "@/config/app-config.json";
import { prisma } from "@/app/lib/prisma";

const defaultConfig = () => ({
  weights: config.weights ?? {},
  penalties: config.penalties ?? {},
  flagsThresholds: config.flags_thresholds ?? {},
  refPercentile: config.ref_percentile ?? 0.9,
  memoMaxDays: config.memo_max_days ?? 30,
  scoreVersion: config.score_version ?? "v2",
});

const toNumber = (value: unknown, fallback: number) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const sanitizeRecord = (
  value: unknown,
  fallback: Record<string, number>
): Record<string, number> => {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(fallback).map(([key, fallbackValue]) => [
      key,
      toNumber(record[key], fallbackValue),
    ])
  );
};

export const GET = async () => {
  const fallback = defaultConfig();
  const dbConfig = await prisma.scoreConfig.findUnique({ where: { id: 1 } });

  const response = {
    weights:
      dbConfig?.weights && typeof dbConfig.weights === "object"
        ? dbConfig.weights
        : fallback.weights,
    penalties:
      dbConfig?.penalties && typeof dbConfig.penalties === "object"
        ? dbConfig.penalties
        : fallback.penalties,
    flagsThresholds:
      dbConfig?.flagsThresholds && typeof dbConfig.flagsThresholds === "object"
        ? dbConfig.flagsThresholds
        : fallback.flagsThresholds,
    refPercentile:
      typeof dbConfig?.refPercentile === "number"
        ? dbConfig.refPercentile
        : fallback.refPercentile,
    memoMaxDays:
      typeof dbConfig?.memoMaxDays === "number"
        ? dbConfig.memoMaxDays
        : fallback.memoMaxDays,
    scoreVersion: dbConfig?.scoreVersion ?? fallback.scoreVersion,
  };

  return NextResponse.json({ config: response });
};

export const PUT = async (request: Request) => {
  const fallback = defaultConfig();
  const payload = await request.json();

  const weights = sanitizeRecord(payload.weights, fallback.weights as Record<string, number>);
  const penalties = sanitizeRecord(
    payload.penalties,
    fallback.penalties as Record<string, number>
  );
  const flagsThresholds = sanitizeRecord(
    payload.flagsThresholds,
    fallback.flagsThresholds as Record<string, number>
  );
  const refPercentile = toNumber(payload.refPercentile, fallback.refPercentile as number);
  const memoMaxDays = Math.round(
    toNumber(payload.memoMaxDays, fallback.memoMaxDays as number)
  );
  const scoreVersion =
    typeof payload.scoreVersion === "string" && payload.scoreVersion
      ? payload.scoreVersion
      : (fallback.scoreVersion as string);

  const data = {
    weights,
    penalties,
    flagsThresholds,
    refPercentile,
    memoMaxDays,
    scoreVersion,
  };

  const saved = await prisma.scoreConfig.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });

  return NextResponse.json({ config: saved });
};
