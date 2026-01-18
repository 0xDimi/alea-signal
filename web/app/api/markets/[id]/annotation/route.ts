import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";

const ALLOWED_STATES = ["NEW", "ON_DECK", "ACTIVE", "ARCHIVE"];

export const PATCH = async (
  request: Request,
  { params }: { params: { id: string } }
) => {
  const marketId = params?.id;
  if (!marketId) {
    return NextResponse.json({ error: "Missing market id." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const state = body?.state ? String(body.state).toUpperCase() : undefined;
  const notes = body?.notes !== undefined ? String(body.notes) : undefined;
  const owner = body?.owner !== undefined ? String(body.owner) : undefined;

  if (state && !ALLOWED_STATES.includes(state)) {
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
