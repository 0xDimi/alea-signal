import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { daysToExpiry, memoMode, normalizeTags } from "@/app/lib/market-utils";
import config from "@/config/app-config.json";

export const GET = async (
  _request: Request,
  { params }: { params: { id: string } }
) => {
  const marketId = params?.id;
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
      score: true,
      annotation: true,
    },
  });

  if (!market) {
    return NextResponse.json({ error: "Market not found." }, { status: 404 });
  }

  const days = daysToExpiry(market.endDate);

  const score = market.score
    ? {
        ...market.score,
        flags: Array.isArray(market.score.flags) ? market.score.flags : [],
      }
    : null;

  return NextResponse.json({
    ...market,
    score,
    tags: normalizeTags(market.tags),
    daysToExpiry: days,
    mode: memoMode(days, config.memo_max_days ?? 30),
  });
};
