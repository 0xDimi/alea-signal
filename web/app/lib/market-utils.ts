export type TagItem = { slug: string; name: string };

export const normalizeTags = (tags: unknown): TagItem[] => {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => {
      if (typeof tag === "string") {
        return { slug: tag.toLowerCase(), name: tag };
      }
      if (tag && typeof tag === "object" && "slug" in tag) {
        const slug = String(tag.slug).toLowerCase();
        const name = "name" in tag ? String(tag.name ?? tag.slug) : slug;
        return { slug, name };
      }
      return null;
    })
    .filter((tag): tag is TagItem => Boolean(tag));
};

export const tagSlugs = (tags: unknown): string[] =>
  normalizeTags(tags).map((tag) => tag.slug);

export const daysToExpiry = (endDate: Date | string | null): number | null => {
  if (!endDate) return null;
  const date = typeof endDate === "string" ? new Date(endDate) : endDate;
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = date.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

export const memoMode = (days: number | null, memoMaxDays: number): "Memo" | "Thesis" | "Unknown" => {
  if (days === null) return "Unknown";
  return days <= memoMaxDays ? "Memo" : "Thesis";
};
