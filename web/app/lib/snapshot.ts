import { list } from "@vercel/blob";

const CACHE_TTL_MS = 60_000;
const MARKET_SNAPSHOT_KEY = "snapshots/markets.json";
const STATUS_SNAPSHOT_KEY = "snapshots/status.json";

type SnapshotCache<T> = {
  fetchedAt: number;
  data: T | null;
  url: string | null;
};

export type MarketSnapshot = {
  generatedAt: string;
  markets: Array<{
    id: string;
    question: string;
    description: string | null;
    endDate: string | null;
    liquidity: number;
    volume24h: number;
    openInterest: number;
    tags: unknown;
    outcomes: unknown;
    restricted: boolean;
    isExcluded: boolean;
    marketUrl: string | null;
    score: {
      totalScore: number;
      components: unknown;
      flags: unknown;
    } | null;
  }>;
};

export type StatusSnapshot = {
  generatedAt: string;
  status: {
    lastAttemptedSyncAt: string | null;
    lastSuccessfulSyncAt: string | null;
    lastError: string | null;
    lastStats: unknown;
    lastRefs: unknown;
  };
};

const cache = new Map<string, SnapshotCache<unknown>>();

const resolveSnapshotUrl = async (
  key: string,
  envUrl: string | null
): Promise<string | null> => {
  if (envUrl) return envUrl;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const result = await list({ prefix: key, limit: 1 });
    const match =
      result.blobs.find((blob) => blob.pathname === key) ?? result.blobs[0];
    return match?.url ?? null;
  } catch (error) {
    console.error("Snapshot list failed", error);
    return null;
  }
};

const loadSnapshot = async <T>(
  key: string,
  envUrl: string | null
): Promise<T | null> => {
  const now = Date.now();
  const cached = cache.get(key) as SnapshotCache<T> | undefined;
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const url =
    cached?.url ?? (await resolveSnapshotUrl(key, envUrl ?? null));
  if (!url) {
    cache.set(key, { fetchedAt: now, data: null, url: null });
    return null;
  }

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Snapshot fetch failed");
    const data = (await response.json()) as T;
    cache.set(key, { fetchedAt: now, data, url });
    return data;
  } catch (error) {
    console.error("Snapshot fetch failed", error);
    cache.set(key, { fetchedAt: now, data: null, url });
    return null;
  }
};

export const loadMarketSnapshot = async (): Promise<MarketSnapshot | null> =>
  loadSnapshot(MARKET_SNAPSHOT_KEY, process.env.MARKETS_SNAPSHOT_URL ?? null);

export const loadStatusSnapshot = async (): Promise<StatusSnapshot | null> =>
  loadSnapshot(STATUS_SNAPSHOT_KEY, process.env.STATUS_SNAPSHOT_URL ?? null);
