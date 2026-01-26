import { runSync } from "@/app/lib/sync-core.mjs";

import type { MarketSnapshot, StatusSnapshot } from "@/app/lib/snapshot";

type RuntimeSnapshot = {
  generatedAt: string;
  markets: MarketSnapshot["markets"];
  status: StatusSnapshot["status"];
};

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;
const cache = new Map<string, { fetchedAt: number; data: RuntimeSnapshot }>();
let inFlight: Promise<RuntimeSnapshot | null> | null = null;

const resolveTtl = () => {
  const raw = process.env.RUNTIME_SYNC_TTL_MS;
  if (!raw) return DEFAULT_TTL_MS;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TTL_MS;
};

const buildStatus = (result: any): StatusSnapshot["status"] => ({
  lastAttemptedSyncAt: result.startedAt?.toISOString?.() ?? null,
  lastSuccessfulSyncAt: result.finishedAt?.toISOString?.() ?? null,
  lastError: result.dbError ?? null,
  lastStats: { events: result.events ?? 0, markets: result.markets ?? 0 },
  lastRefs: result.refs ?? null,
});

export const getRuntimeSnapshot = async (): Promise<RuntimeSnapshot | null> => {
  const ttl = resolveTtl();
  const now = Date.now();
  const cached = cache.get("snapshot");
  if (cached && now - cached.fetchedAt < ttl) {
    return cached.data;
  }

  if (!inFlight) {
    inFlight = runSync({ returnSnapshot: true, skipSnapshotWrite: true })
      .then((result: any) => {
        if (!result?.snapshotMarkets) return null;
        const generatedAt =
          result.finishedAt?.toISOString?.() ?? new Date().toISOString();
        const data: RuntimeSnapshot = {
          generatedAt,
          markets: result.snapshotMarkets,
          status: buildStatus(result),
        };
        cache.set("snapshot", { fetchedAt: Date.now(), data });
        return data;
      })
      .catch((error) => {
        console.error("Runtime sync failed", error);
        return null;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  return inFlight;
};
