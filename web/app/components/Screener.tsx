"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MarketDrawer } from "@/app/components/MarketDrawer";

type TagItem = { slug: string; name: string };
type Annotation = { state?: string; notes?: string; owner?: string };

type MarketRow = {
  id: string;
  question: string;
  description?: string | null;
  endDate?: string | null;
  liquidity: number;
  volume24h: number;
  openInterest: number;
  tags: TagItem[];
  restricted: boolean;
  isExcluded: boolean;
  marketUrl?: string | null;
  score: number;
  scoreComponents: Record<string, number>;
  flags: string[];
  daysToExpiry: number | null;
  mode: "Memo" | "Thesis" | "Unknown";
  annotation?: Annotation | null;
};

type SyncStatus = {
  lastAttemptedSyncAt?: string | null;
  lastSuccessfulSyncAt?: string | null;
  lastError?: string | null;
  lastStats?: { events?: number; markets?: number };
  lastRefs?: { liquidity?: number; volume24h?: number; openInterest?: number };
};

const formatCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const formatMetric = (value: number) => {
  if (!Number.isFinite(value)) return "—";
  return `$${formatCompact.format(value)}`;
};

const formatCount = (value: number) => {
  if (!Number.isFinite(value)) return "—";
  return formatCompact.format(value);
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const scoreTone = (score: number) => {
  if (score >= 80) return "bg-emerald-400/20 text-emerald-950";
  if (score >= 60) return "bg-amber-400/20 text-amber-950";
  if (score >= 40) return "bg-orange-400/20 text-orange-950";
  return "bg-rose-400/20 text-rose-950";
};

const flagLabel = (flag: string) =>
  flag
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const Screener = () => {
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState("");

  const [filters, setFilters] = useState({
    mode: "all",
    minScore: 50,
    sort: "score",
    order: "desc",
    minDays: "",
    maxDays: "",
    hideRestricted: true,
    includeExcluded: false,
    selectedTags: [] as string[],
  });

  const filteredTags = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [tags, tagQuery]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setStatus(data.status ?? null);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch("/api/tags");
      const data = await res.json();
      setTags(data.tags ?? []);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("mode", filters.mode);
    params.set("minScore", String(filters.minScore));
    params.set("sort", filters.sort);
    params.set("order", filters.order);
    if (filters.minDays !== "") params.set("minDays", filters.minDays);
    if (filters.maxDays !== "") params.set("maxDays", filters.maxDays);
    if (filters.hideRestricted) params.set("hideRestricted", "true");
    if (filters.includeExcluded) params.set("includeExcluded", "true");
    if (filters.selectedTags.length) {
      params.set("tags", filters.selectedTags.join(","));
    }

    try {
      const res = await fetch(`/api/markets?${params.toString()}`);
      const data = await res.json();
      setMarkets(data.markets ?? []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchTags();
    fetchStatus();
  }, [fetchTags, fetchStatus]);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  const updateAnnotation = async (marketId: string, payload: Annotation) => {
    const res = await fetch(`/api/markets/${marketId}/annotation`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return;
    const data = await res.json();
    setMarkets((prev) =>
      prev.map((market) =>
        market.id === marketId
          ? { ...market, annotation: data.annotation ?? market.annotation }
          : market
      )
    );
  };

  const syncLabel = status?.lastSuccessfulSyncAt
    ? `Synced ${formatDateTime(status.lastSuccessfulSyncAt)}`
    : "No sync yet";

  return (
    <section className="relative z-10">
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <div className="rounded-full border border-black/10 bg-white/70 px-4 py-2 text-xs uppercase tracking-[0.2em] text-zinc-600 backdrop-blur">
          Alea Signal
        </div>
        <div className="rounded-full border border-black/10 bg-white/70 px-4 py-2 text-xs uppercase tracking-[0.2em] text-zinc-600 backdrop-blur">
          {syncLabel}
        </div>
        {status?.lastError ? (
          <div className="rounded-full border border-rose-200 bg-rose-100 px-4 py-2 text-xs uppercase tracking-[0.2em] text-rose-700">
            Last sync error
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-[0_20px_80px_-60px_rgba(0,0,0,0.6)] backdrop-blur">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Filters
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl text-zinc-900">
              Research window
            </h2>
          </div>

          <div className="space-y-5">
            <div>
              <label className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Mode
              </label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  { label: "All", value: "all" },
                  { label: "Memo", value: "memo" },
                  { label: "Thesis", value: "thesis" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, mode: option.value }))
                    }
                    className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                      filters.mode === option.value
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-black/10 bg-white text-zinc-700 hover:border-zinc-400"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Min score
              </label>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={filters.minScore}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      minScore: Number(event.target.value),
                    }))
                  }
                  className="h-2 w-full accent-zinc-900"
                />
                <span className="w-10 text-right text-sm font-semibold text-zinc-900">
                  {filters.minScore}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                  Min days
                </label>
                <input
                  type="number"
                  value={filters.minDays}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, minDays: event.target.value }))
                  }
                  className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                  Max days
                </label>
                <input
                  type="number"
                  value={filters.maxDays}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, maxDays: event.target.value }))
                  }
                  className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900"
                  placeholder="90"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Sort
              </label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <select
                  value={filters.sort}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, sort: event.target.value }))
                  }
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900"
                >
                  <option value="score">Score</option>
                  <option value="liquidity">Liquidity</option>
                  <option value="volume24h">Volume 24h</option>
                  <option value="openInterest">Open Interest</option>
                  <option value="expiry">Expiry</option>
                </select>
                <select
                  value={filters.order}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, order: event.target.value }))
                  }
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900"
                >
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Visibility
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={filters.hideRestricted}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      hideRestricted: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-zinc-900"
                />
                Hide restricted markets
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={filters.includeExcluded}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      includeExcluded: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-zinc-900"
                />
                Include excluded tags
              </label>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Tags
              </label>
              <input
                value={tagQuery}
                onChange={(event) => setTagQuery(event.target.value)}
                className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900"
                placeholder="Search tags"
              />
              <div className="mt-3 max-h-40 space-y-2 overflow-auto pr-1">
                {filteredTags.map((tag) => {
                  const active = filters.selectedTags.includes(tag.slug);
                  return (
                    <button
                      key={tag.slug}
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          selectedTags: active
                            ? prev.selectedTags.filter((slug) => slug !== tag.slug)
                            : [...prev.selectedTags, tag.slug],
                        }))
                      }
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                        active
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-black/10 bg-white text-zinc-700 hover:border-zinc-400"
                      }`}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        <div className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-[0_20px_80px_-60px_rgba(0,0,0,0.6)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                Market universe
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-zinc-900">
                Researchability rankings
              </h2>
              <p className="mt-2 max-w-xl text-sm text-zinc-600">
                Click a row to see the scoring breakdown, flags, and research
                notes.
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-zinc-600">
              {loading ? "Loading markets…" : `${markets.length} markets`}
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-y-3 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.2em] text-zinc-500">
                  <th className="px-3">Score</th>
                  <th className="px-3">Mode</th>
                  <th className="px-3">Market</th>
                  <th className="px-3">Tags</th>
                  <th className="px-3">Expiry</th>
                  <th className="px-3">Liquidity</th>
                  <th className="px-3">Vol 24h</th>
                  <th className="px-3">Open Int</th>
                  <th className="px-3">Flags</th>
                  <th className="px-3">State</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-zinc-500">
                      Pulling markets…
                    </td>
                  </tr>
                ) : markets.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-zinc-500">
                      No markets match the current filters.
                    </td>
                  </tr>
                ) : (
                  markets.map((market) => (
                    <tr
                      key={market.id}
                      onClick={() => setSelectedMarketId(market.id)}
                      className="cursor-pointer rounded-2xl border border-transparent bg-white text-zinc-800 shadow-sm transition hover:border-zinc-200 hover:bg-zinc-50"
                    >
                      <td className="px-3 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${scoreTone(
                            market.score
                          )}`}
                          title={Object.entries(market.scoreComponents)
                            .map(
                              ([key, value]) =>
                                `${key}: ${Number(value).toFixed(1)}`
                            )
                            .join("\n")}
                        >
                          {Math.round(market.score)}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-xs uppercase tracking-[0.2em] text-zinc-500">
                        {market.mode}
                      </td>
                      <td className="px-3 py-4">
                        <div className="max-w-xs text-sm font-semibold text-zinc-900">
                          {market.question}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {market.restricted ? "Restricted" : "Open"}
                          {market.isExcluded ? " · Excluded" : ""}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-1">
                          {market.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag.slug}
                              className="rounded-full border border-black/5 bg-zinc-100 px-2 py-1 text-[11px] text-zinc-700"
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-sm text-zinc-700">
                        {market.daysToExpiry !== null ? `${market.daysToExpiry}d` : "—"}
                      </td>
                      <td className="px-3 py-4 text-sm text-zinc-700">
                        {formatMetric(market.liquidity)}
                      </td>
                      <td className="px-3 py-4 text-sm text-zinc-700">
                        {formatMetric(market.volume24h)}
                      </td>
                      <td className="px-3 py-4 text-sm text-zinc-700">
                        {formatCount(market.openInterest)}
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-1">
                          {market.flags.slice(0, 2).map((flag) => (
                            <span
                              key={flag}
                              className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700"
                            >
                              {flagLabel(flag)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <select
                          value={market.annotation?.state ?? "NEW"}
                          onChange={(event) => {
                            event.stopPropagation();
                            updateAnnotation(market.id, {
                              state: event.target.value,
                            });
                          }}
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-700"
                        >
                          <option value="NEW">New</option>
                          <option value="ON_DECK">On Deck</option>
                          <option value="ACTIVE">Active</option>
                          <option value="ARCHIVE">Archive</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <MarketDrawer
        marketId={selectedMarketId}
        onClose={() => setSelectedMarketId(null)}
        onUpdateAnnotation={updateAnnotation}
      />
    </section>
  );
};
