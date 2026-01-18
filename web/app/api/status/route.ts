import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";

export const GET = async () => {
  const status = await prisma.syncStatus.findUnique({ where: { id: 1 } });
  return NextResponse.json({ status });
};
