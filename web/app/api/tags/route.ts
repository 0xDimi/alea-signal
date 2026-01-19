import { NextResponse } from "next/server";

import config from "@/config/app-config.json";
import { prisma } from "@/app/lib/prisma";
import { normalizeTags } from "@/app/lib/market-utils";

type MarketTagRow = {
  tags: unknown;
};

const buildAllowedTagSet = () => {
  const allowed = new Set<string>();
  const sectors = (config.allowed_sectors ?? []) as string[];
  const map = (config.sector_map ?? {}) as Record<string, string[]>;
  sectors.forEach((sector) => {
    const tags = map[sector] ?? [];
    tags.forEach((tag) => allowed.add(String(tag).toLowerCase()));
  });
  return allowed;
};

export const GET = async () => {
  const markets: MarketTagRow[] = await prisma.market.findMany({
    select: { tags: true },
  });

  const tagMap = new Map();
  const allowedTags = buildAllowedTagSet();
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
};
