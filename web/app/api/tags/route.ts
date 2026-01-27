import { NextResponse } from "next/server";

import config from "@/config/app-config.json";
import { getPrisma } from "@/app/lib/prisma";
import { normalizeTags } from "@/app/lib/market-utils";
import { loadMarketSnapshot } from "@/app/lib/snapshot";
import { getRuntimeSnapshot } from "@/app/lib/runtime-sync-cache";

type MarketTagRow = {
  tags: unknown;
  source?: string | null;
  marketUrl?: string | null;
};

const buildAllowedTagSet = (sectorsOverride?: string[]) => {
  const allowed = new Set<string>();
  const sectors = (sectorsOverride?.length
    ? sectorsOverride
    : (config.allowed_sectors ?? [])) as string[];
  const map = (config.sector_map ?? {}) as Record<string, string[]>;
  sectors.forEach((sector) => {
    const tags = map[sector] ?? [];
    tags.forEach((tag) => allowed.add(String(tag).toLowerCase()));
  });
  return allowed;
};

const resolveSelectedSectors = (searchParams: URLSearchParams) => {
  const raw = searchParams.get("sectors");
  const available = (config.allowed_sectors ?? []).map((sector) =>
    String(sector).toLowerCase()
  );
  if (!raw) return available;
  const selected = raw
    .split(",")
    .map((sector) => sector.trim().toLowerCase())
    .filter((sector) => sector.length > 0 && available.includes(sector));
  return selected.length ? selected : available;
};

const resolveSourceFilter = (searchParams: URLSearchParams) => {
  const raw = (searchParams.get("source") ?? "all").toLowerCase();
  return raw === "kalshi" || raw === "polymarket" ? raw : "all";
};

const resolveSource = (market: { source?: string | null; marketUrl?: string | null }) => {
  const explicit = market.source ? String(market.source).toLowerCase() : null;
  if (explicit === "kalshi" || explicit === "polymarket") return explicit;
  const url = market.marketUrl ?? "";
  if (url.includes("kalshi.com")) return "kalshi";
  return "polymarket";
};

export const GET = async (request: Request) => {
  try {
    const { searchParams } = new URL(request.url);
    const selectedSectors = resolveSelectedSectors(searchParams);
    const sourceFilter = resolveSourceFilter(searchParams);
    const snapshot = await loadMarketSnapshot();
    const maxSnapshotAgeMs = Number(
      process.env.SNAPSHOT_MAX_AGE_MS ?? 6 * 60 * 60 * 1000
    );
    const snapshotAgeMs =
      snapshot?.generatedAt && !Number.isNaN(new Date(snapshot.generatedAt).getTime())
        ? Date.now() - new Date(snapshot.generatedAt).getTime()
        : Number.POSITIVE_INFINITY;
    const snapshotStale =
      !snapshot?.markets?.length ||
      !Number.isFinite(maxSnapshotAgeMs) ||
      snapshotAgeMs > maxSnapshotAgeMs;
    let markets: MarketTagRow[] = [];
    if (!snapshotStale && snapshot?.markets?.length) {
      markets = snapshot.markets.map((market) => ({
        tags: market.tags,
        source: market.source ?? null,
        marketUrl: market.marketUrl ?? null,
      }));
    } else {
      const runtimeSnapshot = await getRuntimeSnapshot();
      if (runtimeSnapshot?.markets?.length) {
        markets = runtimeSnapshot.markets.map((market) => ({
          tags: market.tags,
          source: market.source ?? null,
          marketUrl: market.marketUrl ?? null,
        }));
      }
    }

    if (!markets.length) {
      const prisma = getPrisma();
      markets = await prisma.market.findMany({
        select: { tags: true, marketUrl: true },
      });
    }

    const tagMap = new Map();
    const allowedTags = buildAllowedTagSet(selectedSectors);
    markets.forEach((market) => {
      if (sourceFilter !== "all") {
        const source = resolveSource(market);
        if (source !== sourceFilter) return;
      }
      normalizeTags(market.tags).forEach((tag) => {
        if (!allowedTags.has(tag.slug)) return;
        if (!tagMap.has(tag.slug)) {
          tagMap.set(tag.slug, { slug: tag.slug, name: tag.name });
        }
      });
    });

    const tags = Array.from(tagMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return NextResponse.json({ tags });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
