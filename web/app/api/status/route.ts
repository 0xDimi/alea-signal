import { NextResponse } from "next/server";

import { getPrisma } from "@/app/lib/prisma";
import { loadStatusSnapshot } from "@/app/lib/snapshot";

export const GET = async () => {
  try {
    const snapshot = await loadStatusSnapshot();
    if (snapshot?.status) {
      return NextResponse.json({ status: snapshot.status });
    }
    const prisma = getPrisma();
    const status = await prisma.syncStatus.findUnique({ where: { id: 1 } });
    return NextResponse.json({ status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
