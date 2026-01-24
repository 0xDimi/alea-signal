import { NextResponse } from "next/server";

import { getPrisma } from "@/app/lib/prisma";

export const GET = async () => {
  try {
    const prisma = getPrisma();
    const status = await prisma.syncStatus.findUnique({ where: { id: 1 } });
    return NextResponse.json({ status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
