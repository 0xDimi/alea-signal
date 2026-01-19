import { NextResponse } from "next/server";
import { MarketState } from "@prisma/client";

import { prisma } from "@/app/lib/prisma";

const ALLOWED_STATES: MarketState[] = ["NEW", "ON_DECK", "ACTIVE", "ARCHIVE"];

export const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: marketId } = await params;
  if (!marketId) {
    return NextResponse.json({ error: "Missing market id." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedState = body?.state ? String(body.state).toUpperCase() : undefined;
  const state =
    requestedState && ALLOWED_STATES.includes(requestedState as MarketState)
      ? (requestedState as MarketState)
      : undefined;
  const notes = body?.notes !== undefined ? String(body.notes) : undefined;
  const owner = body?.owner !== undefined ? String(body.owner) : undefined;

  if (requestedState && !state) {
    return NextResponse.json({ error: "Invalid state." }, { status: 400 });
  }

  const annotation = await prisma.annotation.upsert({
    where: { marketId },
    update: {
      state: state ?? undefined,
      notes,
      owner,
    },
    create: {
      marketId,
      state: state ?? "NEW",
      notes,
      owner,
    },
  });

  return NextResponse.json({ annotation });
};
