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
  lastError: null,
  lastStats: { events: result.events ?? 0, markets: result.markets ?? 0 },
  lastRefs: result.refs ?? null,
});

const dedupeById = (records: MarketSnapshot["markets"]) => {
  const map = new Map<string, MarketSnapshot["markets"][number]>();
  records.forEach((record) => {
    if (!record?.id) return;
    map.set(String(record.id), record);
  });
  return Array.from(map.values());
};

const hasKalshiMarkets = (records: MarketSnapshot["markets"]) =>
  records.some((record) => {
    const source = String(record.source ?? "").toLowerCase();
    if (source.includes("kalshi")) return true;
    const url = String(record.marketUrl ?? "");
    return url.includes("kalshi.com");
  });

const ensureOutcomes = (records: MarketSnapshot["markets"]) =>
  records.map((record) => {
    if (record.outcomes && Array.isArray(record.outcomes) && record.outcomes.length) {
      return record;
    }
    const payload = record as { rawPayload?: any };
    const market = payload.rawPayload?.market ?? payload.rawPayload ?? null;
    const event = payload.rawPayload?.event ?? payload.rawPayload ?? null;
    const outcomePrices =
      market?.outcomePrices ??
      market?.outcome_prices ??
      market?.outcomeTokenPrices ??
      market?.outcome_token_prices ??
      event?.outcomePrices ??
      event?.outcome_prices ??
      null;
    if (!Array.isArray(outcomePrices) || !outcomePrices.length) {
      return record;
    }
    const names =
      outcomePrices.length === 2 ? ["Yes", "No"] : outcomePrices.map((_, idx) => `Outcome ${idx + 1}`);
    const outcomes = names.map((name, idx) => {
      const price = Number(outcomePrices[idx]);
      return Number.isFinite(price) ? { name, probability: price } : { name };
    });
    return { ...record, outcomes };
  });

export const getRuntimeSnapshot = async (options?: {
  requireKalshi?: boolean;
}): Promise<RuntimeSnapshot | null> => {
  const ttl = resolveTtl();
  const now = Date.now();
  const cached = cache.get("snapshot");
  if (cached && now - cached.fetchedAt < ttl) {
    if (options?.requireKalshi && !hasKalshiMarkets(cached.data.markets)) {
      cache.delete("snapshot");
    } else {
      return cached.data;
    }
  }

  if (!inFlight) {
    inFlight = runSync({ returnSnapshot: true, skipSnapshotWrite: true })
      .then((result: any) => {
        if (!result?.snapshotMarkets) return null;
        const generatedAt =
          result.finishedAt?.toISOString?.() ?? new Date().toISOString();
        const normalizedMarkets = ensureOutcomes(dedupeById(result.snapshotMarkets));
        const data: RuntimeSnapshot = {
          generatedAt,
          markets: normalizedMarkets,
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
