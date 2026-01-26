import { NextResponse } from "next/server";

import { getPrisma } from "@/app/lib/prisma";
import { loadStatusSnapshot } from "@/app/lib/snapshot";
import { getRuntimeSnapshot } from "@/app/lib/runtime-sync-cache";

export const GET = async () => {
  try {
    const snapshot = await loadStatusSnapshot();
    const maxSnapshotAgeMs = Number(
      process.env.SNAPSHOT_MAX_AGE_MS ?? 6 * 60 * 60 * 1000
    );
    const snapshotAgeMs =
      snapshot?.generatedAt && !Number.isNaN(new Date(snapshot.generatedAt).getTime())
        ? Date.now() - new Date(snapshot.generatedAt).getTime()
        : Number.POSITIVE_INFINITY;
    const snapshotStale =
      !snapshot?.status ||
      !Number.isFinite(maxSnapshotAgeMs) ||
      snapshotAgeMs > maxSnapshotAgeMs;

    if (!snapshotStale && snapshot?.status) {
      return NextResponse.json({ status: snapshot.status });
    }

    const runtimeSnapshot = await getRuntimeSnapshot();
    if (runtimeSnapshot?.status) {
      return NextResponse.json({ status: runtimeSnapshot.status });
    }

    const prisma = getPrisma();
    const status = await prisma.syncStatus.findUnique({ where: { id: 1 } });
    return NextResponse.json({ status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
