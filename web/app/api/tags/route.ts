import { NextResponse } from "next/server";

import config from "@/config/app-config.json";
import { getPrisma } from "@/app/lib/prisma";
import { normalizeTags } from "@/app/lib/market-utils";
import { loadMarketSnapshot } from "@/app/lib/snapshot";

type MarketTagRow = {
  tags: unknown;
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

export const GET = async (request: Request) => {
  try {
    const { searchParams } = new URL(request.url);
    const selectedSectors = resolveSelectedSectors(searchParams);
    const snapshot = await loadMarketSnapshot();
    let markets: MarketTagRow[] = [];
    if (snapshot?.markets?.length) {
      markets = snapshot.markets.map((market) => ({ tags: market.tags }));
    } else {
      const prisma = getPrisma();
      markets = await prisma.market.findMany({
        select: { tags: true },
      });
    }

    const tagMap = new Map();
    const allowedTags = buildAllowedTagSet(selectedSectors);
    markets.forEach((market) => {
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
