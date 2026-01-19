"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MarketDrawer } from "@/app/components/MarketDrawer";

type TagItem = { slug: string; name: string };
type Annotation = { state?: string; notes?: string; owner?: string };
type ScoreConfig = {
  weights: Record<string, number>;
  penalties?: Record<string, number>;
  flagsThresholds?: Record<string, number>;
  refPercentile?: number;
  memoMaxDays?: number;
  scoreVersion?: string;
};

type MarketRow = {
  id: string;
  question: string;
  description?: string | null;
  endDate?: string | null;
  liquidity: number;
  volume24h: number;
  openInterest: number | null;
  tags: TagItem[];
  restricted: boolean;
  isExcluded: boolean;
  marketUrl?: string | null;
  score: number;
  scoreComponents: Record<string, number>;
  flags: string[];
  daysToExpiry: number | null;
  expiryLabel?: string | null;
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

const formatMetric = (value?: number | null) => {
  if (!Number.isFinite(value ?? NaN)) return "—";
  return `$${formatCompact.format(value ?? 0)}`;
};

const formatCount = (value?: number | null) => {
  if (!Number.isFinite(value ?? NaN)) return "—";
  return formatCompact.format(value ?? 0);
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
  if (score >= 80) {
    const intensity = Math.min(1, Math.max(0, (score - 80) / 20));
    return {
      className: "text-emerald-100",
      style: {
        backgroundColor: `rgba(16, 185, 129, ${0.18 + intensity * 0.22})`,
      },
    };
  }
  if (score >= 70) {
    return { className: "bg-lime-300/20 text-lime-200", style: undefined };
  }
  if (score >= 60) {
    return { className: "bg-amber-300/20 text-amber-200", style: undefined };
  }
  if (score >= 50) {
    return { className: "bg-orange-300/20 text-orange-200", style: undefined };
  }
  return { className: "bg-rose-400/20 text-rose-200", style: undefined };
};

const flagLabel = (flag: string) =>
  flag
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const scoreWeightLabels: Record<string, string> = {
  resolutionIntegrity: "Resolution integrity",
  liquidityMicrostructure: "Liquidity & microstructure",
  modelability: "Modelability",
  participationQuality: "Participation quality",
  strategicFit: "Strategic fit",
};

export const Screener = () => {
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState("");
  const [scoreConfig, setScoreConfig] = useState<ScoreConfig | null>(null);
  const [savingScoreConfig, setSavingScoreConfig] = useState(false);

  const [filters, setFilters] = useState({
    mode: "all",
    minScore: 50,
    sort: "score",
    order: "desc",
    minDays: "",
    maxDays: "",
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

  const fetchScoreConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/score-config");
      const data = await res.json();
      setScoreConfig(data.config ?? null);
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

  const saveScoreConfig = async () => {
    if (!scoreConfig) return;
    setSavingScoreConfig(true);
    try {
      const res = await fetch("/api/score-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weights: scoreConfig.weights,
          penalties: scoreConfig.penalties,
          flagsThresholds: scoreConfig.flagsThresholds,
          refPercentile: scoreConfig.refPercentile,
          memoMaxDays: scoreConfig.memoMaxDays,
          scoreVersion: scoreConfig.scoreVersion,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setScoreConfig(data.config ?? scoreConfig);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setSavingScoreConfig(false);
    }
  };

  useEffect(() => {
    fetchTags();
    fetchStatus();
    fetchScoreConfig();
  }, [fetchTags, fetchStatus, fetchScoreConfig]);

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
        <div className="rounded-full border border-white/10 bg-slate-900/70 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-300 backdrop-blur">
          Alea Signal
        </div>
        <div className="rounded-full border border-white/10 bg-slate-900/70 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-300 backdrop-blur">
          {syncLabel}
        </div>
        {status?.lastError ? (
          <div className="rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-rose-200">
            Last sync error
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-[0_20px_80px_-60px_rgba(2,6,23,0.6)] backdrop-blur">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Filters
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl text-slate-100">
              Research window
            </h2>
          </div>

          <div className="space-y-5">
            <div>
              <label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
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
                        ? "border-sky-400/70 bg-sky-400 text-slate-950"
                        : "border-white/10 bg-slate-900/60 text-slate-200 hover:border-sky-400/60"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
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
                  className="h-2 w-full accent-sky-400"
                />
                <span className="w-10 text-right text-sm font-semibold text-slate-100">
                  {filters.minScore}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                  Min days
                </label>
                <input
                  type="number"
                  value={filters.minDays}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, minDays: event.target.value }))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                  Max days
                </label>
                <input
                  type="number"
                  value={filters.maxDays}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, maxDays: event.target.value }))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
                  placeholder="90"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                Sort
              </label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <select
                  value={filters.sort}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, sort: event.target.value }))
                  }
                  className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
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
                  className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                Visibility
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={filters.includeExcluded}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      includeExcluded: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-sky-400"
                />
                Include excluded tags
              </label>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                Tags
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={tagQuery}
                  onChange={(event) => setTagQuery(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
                  placeholder="Search tags"
                />
                <button
                  onClick={() => {
                    setTagQuery("");
                    setFilters((prev) => ({ ...prev, selectedTags: [] }));
                  }}
                  className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-sky-400/60"
                >
                  Reset
                </button>
              </div>
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
                          ? "border-sky-400/70 bg-sky-400 text-slate-950"
                          : "border-white/10 bg-slate-900/60 text-slate-200 hover:border-sky-400/60"
                      }`}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                Score tuning (v2)
              </label>
              {scoreConfig ? (
                <div className="mt-3 space-y-3">
                  {Object.entries(scoreWeightLabels).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <span className="text-xs text-slate-300">{label}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={scoreConfig.weights?.[key] ?? 0}
                        onChange={(event) =>
                          setScoreConfig((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  weights: {
                                    ...prev.weights,
                                    [key]: Number(event.target.value),
                                  },
                                }
                              : prev
                          )
                        }
                        className="w-20 rounded-lg border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-100"
                      />
                    </div>
                  ))}
                  <button
                    onClick={saveScoreConfig}
                    className="w-full rounded-full bg-sky-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-950"
                    disabled={savingScoreConfig}
                  >
                    {savingScoreConfig ? "Saving…" : "Save weights"}
                  </button>
                  <p className="text-xs text-slate-400">
                    Updated weights apply on the next sync run.
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-400">Loading weights…</p>
              )}
            </div>
          </div>
        </aside>

        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-[0_20px_80px_-60px_rgba(2,6,23,0.6)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Market universe
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-slate-100">
                Researchability rankings
              </h2>
              <p className="mt-2 max-w-xl text-sm text-slate-300">
                Click a row to see the scoring breakdown, flags, and research
                notes.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-300">
              {loading ? "Loading markets…" : `${markets.length} markets`}
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-y-3 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-400">
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
                    <td colSpan={10} className="px-3 py-8 text-slate-400">
                      Pulling markets…
                    </td>
                  </tr>
                ) : markets.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-slate-400">
                      No markets match the current filters.
                    </td>
                  </tr>
                ) : (
                  markets.map((market) => (
                    <tr
                      key={market.id}
                      onClick={() => setSelectedMarketId(market.id)}
                      className="cursor-pointer rounded-2xl border border-transparent bg-slate-900/70 text-slate-100 shadow-sm transition hover:border-slate-700 hover:bg-slate-800/80"
                    >
                      <td className="px-3 py-4">
                        {(() => {
                          const tone = scoreTone(market.score);
                          return (
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${tone.className}`}
                              style={tone.style}
                              title={Object.entries(market.scoreComponents)
                                .map(
                                  ([key, value]) =>
                                    `${key}: ${Number(value).toFixed(1)}`
                                )
                                .join("\n")}
                            >
                              {Math.round(market.score)}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-4 text-xs uppercase tracking-[0.2em] text-slate-400">
                        {market.mode}
                      </td>
                      <td className="px-3 py-4">
                        <div className="max-w-xs text-sm font-semibold text-slate-100">
                          {market.question}
                        </div>
                        <div className="text-xs text-slate-400">
                          Active{market.isExcluded ? " · Excluded" : ""}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-1">
                          {market.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag.slug}
                              className="rounded-full border border-white/10 bg-slate-800/70 px-2 py-1 text-[11px] text-slate-200"
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-200">
                        {market.expiryLabel ??
                          (market.daysToExpiry !== null ? `${market.daysToExpiry}d` : "—")}
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-200">
                        {formatMetric(market.liquidity)}
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-200">
                        {formatMetric(market.volume24h)}
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-200">
                        {formatCount(market.openInterest)}
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-1">
                          {market.flags.slice(0, 2).map((flag) => (
                            <span
                              key={flag}
                              className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200"
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
                          className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200"
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
