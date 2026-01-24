import { NextResponse } from "next/server";

import { getPrisma } from "@/app/lib/prisma";

const parseNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const parseList = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const prisma = getPrisma();
    const { id: marketId } = await params;
    if (!marketId) {
      return NextResponse.json({ error: "Missing market id." }, { status: 400 });
    }

    const researchPack = await prisma.researchPack.findUnique({
      where: { marketId },
    });

    return NextResponse.json({ researchPack });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

export const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const prisma = getPrisma();
    const { id: marketId } = await params;
    if (!marketId) {
      return NextResponse.json({ error: "Missing market id." }, { status: 400 });
    }

    const payload = await request.json();

    const marketProbability = parseNumber(payload.marketProbability);
    const aleaProbability = parseNumber(payload.aleaProbability);
    const delta =
      marketProbability !== null && aleaProbability !== null
        ? aleaProbability - marketProbability
        : null;

    const data = {
      marketProbability,
      aleaProbability,
      delta,
      confidence: payload.confidence ?? null,
      decision: payload.decision ?? null,
      nextCatalystDate: payload.nextCatalystDate
        ? new Date(payload.nextCatalystDate)
        : null,
      nextCatalystNote: payload.nextCatalystNote ?? null,
      resolutionRules: payload.resolutionRules ?? null,
      sources: parseList(payload.sources),
      evidenceChecklist: parseList(payload.evidenceChecklist),
      leadingIndicators: parseList(payload.leadingIndicators),
      keyRisks: parseList(payload.keyRisks),
      marketDrivers: parseList(payload.marketDrivers),
    };

    const researchPack = await prisma.researchPack.upsert({
      where: { marketId },
      update: data,
      create: { marketId, ...data },
    });

    return NextResponse.json({ researchPack });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
