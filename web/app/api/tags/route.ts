import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { normalizeTags } from "@/app/lib/market-utils";

export const GET = async () => {
  const markets = await prisma.market.findMany({
    select: { tags: true },
  });

  const tagMap = new Map();
  markets.forEach((market) => {
    normalizeTags(market.tags).forEach((tag) => {
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
