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
      className: "text-emerald-50 ring-1 ring-emerald-300/30",
      style: {
        backgroundColor: `rgba(16, 185, 129, ${0.18 + intensity * 0.22})`,
      },
    };
  }
  if (score >= 70) {
    return {
      className: "bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/20",
      style: undefined,
    };
  }
  if (score >= 60) {
    return {
      className: "bg-amber-300/20 text-amber-100 ring-1 ring-amber-200/20",
      style: undefined,
    };
  }
  if (score >= 50) {
    return {
      className: "bg-orange-300/20 text-orange-100 ring-1 ring-orange-200/20",
      style: undefined,
    };
  }
  return {
    className: "bg-rose-400/20 text-rose-100 ring-1 ring-rose-200/20",
    style: undefined,
  };
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

const scoreComponentLabel = (key: string) =>
  scoreWeightLabels[key] ?? flagLabel(key);

const topScoreComponents = (components: Record<string, number>) =>
  Object.entries(components ?? {})
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3)
    .map(([key, value]) => ({
      label: scoreComponentLabel(key),
      value: Number(value).toFixed(1),
    }));

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

  const clampScore = (value: number) => Math.min(100, Math.max(0, value));
  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-soft)] focus-visible:border-transparent";
  const inputBase = `w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2.5 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--ink-dim)] ${focusRing}`;
  const badgeClass =
    "inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--panel-glass)] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-dim)] backdrop-blur";
  const rowCellBase =
    "border-y border-[color:var(--border)] px-3 py-4 transition-colors first:rounded-l-[var(--radius-md)] first:border-l last:rounded-r-[var(--radius-md)] last:border-r";
  const rowCell = (isSelected: boolean) =>
    `${rowCellBase} ${
      isSelected
        ? "bg-[color:var(--panel-strong)] border-[color:var(--accent-strong)] shadow-[0_16px_36px_-28px_rgba(111,210,255,0.6)]"
        : "bg-[color:var(--panel)] group-hover:bg-[color:var(--panel-strong)]"
    }`;
  const tableHeadCell =
    "sticky top-0 z-10 bg-[color:var(--panel-glass)] px-3 py-2 text-left text-[12px] font-semibold tracking-[0.06em] text-[color:var(--ink-dim)] backdrop-blur";

  const filteredTags = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [tags, tagQuery]);

  const selectedTagItems = useMemo(() => {
    if (!filters.selectedTags.length) return [];
    const lookup = new Map(tags.map((tag) => [tag.slug, tag]));
    return filters.selectedTags.map(
      (slug) => lookup.get(slug) ?? { slug, name: slug }
    );
  }, [filters.selectedTags, tags]);

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
        <div className={badgeClass}>Alea Signal</div>
        <div className={badgeClass}>{syncLabel}</div>
        {status?.lastError ? (
          <div
            className="inline-flex items-center rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-rose-200"
            title={status.lastError ?? "Last sync error"}
          >
            Last sync error
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--panel-glass)] p-6 shadow-[var(--shadow-panel)] backdrop-blur lg:sticky lg:top-8 lg:self-start">
          <div className="mb-6">
            <p className="text-xs font-semibold text-[color:var(--ink-dim)]">
              Filters
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[color:var(--ink-strong)]">
              Research window
            </h2>
          </div>

          <div className="space-y-5">
            <div>
              <label className="text-xs font-semibold text-[color:var(--ink-muted)]">
                Mode
              </label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                    className={`rounded-full border px-3 py-2.5 text-xs font-semibold transition ${focusRing} ${
                      filters.mode === option.value
                        ? "border-transparent bg-[color:var(--accent)] text-slate-950 shadow-[0_8px_24px_-16px_rgba(125,211,252,0.9)]"
                        : "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--ink)] hover:border-[color:var(--accent-soft)]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[color:var(--ink-muted)]">
                Minimum score
              </label>
              <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={filters.minScore}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      minScore: clampScore(Number(event.target.value)),
                    }))
                  }
                  className="h-2 w-full accent-[color:var(--accent)]"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={filters.minScore}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      minScore: clampScore(Number(event.target.value)),
                    }))
                  }
                  className={`w-16 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-2 text-right text-sm text-[color:var(--ink)] ${focusRing}`}
                />
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-[color:var(--ink-dim)]">
                <span>0</span>
                <span>100</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-[color:var(--ink-muted)]">
                  Min days
                </label>
                <input
                  type="number"
                  value={filters.minDays}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, minDays: event.target.value }))
                  }
                  className={`mt-2 ${inputBase}`}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[color:var(--ink-muted)]">
                  Max days
                </label>
                <input
                  type="number"
                  value={filters.maxDays}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, maxDays: event.target.value }))
                  }
                  className={`mt-2 ${inputBase}`}
                  placeholder="90"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[color:var(--ink-muted)]">
                Sort
              </label>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select
                  value={filters.sort}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, sort: event.target.value }))
                  }
                  className={inputBase}
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
                  className={inputBase}
                >
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-semibold text-[color:var(--ink-muted)]">
                Visibility
              </label>
              <label className="flex items-center gap-2 text-sm text-[color:var(--ink)]">
                <input
                  type="checkbox"
                  checked={filters.includeExcluded}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      includeExcluded: event.target.checked,
                    }))
                  }
                  className={`h-4 w-4 accent-[color:var(--accent)] ${focusRing}`}
                />
                Include excluded tags
              </label>
            </div>

            <div>
              <label className="text-xs font-semibold text-[color:var(--ink-muted)]">
                Tags
              </label>
              {selectedTagItems.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedTagItems.map((tag) => (
                    <button
                      key={tag.slug}
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          selectedTags: prev.selectedTags.filter((slug) => slug !== tag.slug),
                        }))
                      }
                      className={`group inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-1 text-xs text-[color:var(--ink-muted)] transition hover:border-[color:var(--accent-soft)] ${focusRing}`}
                    >
                      <span>{tag.name}</span>
                      <span className="text-[10px] text-[color:var(--ink-dim)] group-hover:text-[color:var(--ink)]">
                        x
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, selectedTags: [] }))
                    }
                    className={`rounded-full border border-[color:var(--border)] bg-transparent px-3 py-1 text-[11px] font-semibold text-[color:var(--ink)] transition hover:border-[color:var(--accent-soft)] hover:text-[color:var(--ink-strong)] ${focusRing}`}
                  >
                    Clear all
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-xs text-[color:var(--ink-dim)]">
                  No tags selected yet.
                </p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <input
                  value={tagQuery}
                  onChange={(event) => setTagQuery(event.target.value)}
                  className={inputBase}
                  placeholder="Search tags"
                />
                <button
                  onClick={() => {
                    setTagQuery("");
                  }}
                  className={`rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-[11px] font-semibold text-[color:var(--ink)] transition hover:border-[color:var(--accent-soft)] ${focusRing}`}
                >
                  Clear
                </button>
              </div>
              <div className="mt-3 max-h-44 space-y-2 overflow-auto pr-1">
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
                      className={`w-full rounded-[var(--radius-sm)] border px-3 py-2.5 text-left text-sm transition ${focusRing} ${
                        active
                          ? "border-transparent bg-[color:var(--accent)] text-slate-950 shadow-[0_8px_24px_-16px_rgba(125,211,252,0.9)]"
                          : "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--ink)] hover:border-[color:var(--accent-soft)]"
                      }`}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <details className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
              <summary
                className={`flex cursor-pointer items-center justify-between text-xs font-semibold text-[color:var(--ink-muted)] ${focusRing}`}
              >
                <span>Score tuning (v2)</span>
                <span className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--ink-dim)]">
                  Admin
                </span>
              </summary>
              {scoreConfig ? (
                <div className="mt-4 space-y-3">
                  {Object.entries(scoreWeightLabels).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <span className="text-xs text-[color:var(--ink-muted)]">
                        {label}
                      </span>
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
                        className={`w-20 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--panel)] px-2 py-1 text-xs text-[color:var(--ink)] ${focusRing}`}
                      />
                    </div>
                  ))}
                  <button
                    onClick={saveScoreConfig}
                    className={`w-full rounded-full bg-[color:var(--accent)] px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-[color:var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
                    disabled={savingScoreConfig}
                  >
                    {savingScoreConfig ? "Saving…" : "Save weights"}
                  </button>
                  <p className="text-xs text-[color:var(--ink-dim)]">
                    Updated weights apply on the next sync run.
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-xs text-[color:var(--ink-dim)]">
                  Loading weights…
                </p>
              )}
            </details>
          </div>
        </aside>

        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--panel-glass)] p-6 shadow-[var(--shadow-panel)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-[color:var(--ink-dim)]">
                Market universe
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[color:var(--ink-strong)]">
                Researchability rankings
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-[color:var(--ink-muted)]">
                Click a row to see the scoring breakdown, flags, and research
                notes.
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--ink-muted)]">
              <div className="text-[11px] font-semibold text-[color:var(--ink-dim)]">
                Markets
              </div>
              <div className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
                {loading ? "…" : markets.length}
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3 lg:hidden">
            {loading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`card-skeleton-${index}`}
                  className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--panel)] p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="h-5 w-20 animate-pulse rounded-full bg-[color:var(--panel-strong)]" />
                    <div className="h-4 w-16 animate-pulse rounded-full bg-[color:var(--panel-strong)]" />
                  </div>
                  <div className="mt-4 h-4 w-3/4 animate-pulse rounded-full bg-[color:var(--panel-strong)]" />
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {Array.from({ length: 4 }).map((__, metricIndex) => (
                      <div
                        key={`card-metric-${index}-${metricIndex}`}
                        className="h-4 w-full animate-pulse rounded-full bg-[color:var(--panel-strong)]"
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : markets.length === 0 ? (
              <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--panel)] p-4 text-sm text-[color:var(--ink-dim)]">
                No markets match the current filters.
              </div>
            ) : (
              markets.map((market) => {
                const isSelected = selectedMarketId === market.id;
                const tagOverflow = Math.max(0, market.tags.length - 2);
                const flagOverflow = Math.max(0, market.flags.length - 1);
                const hasMeta = market.restricted || market.isExcluded;
                const stateLabel = flagLabel(market.annotation?.state ?? "NEW");
                const tone = scoreTone(market.score);

                return (
                  <div
                    key={market.id}
                    onClick={() => setSelectedMarketId(market.id)}
                    className={`cursor-pointer rounded-[var(--radius-md)] border p-4 transition ${
                      isSelected
                        ? "border-[color:var(--accent-strong)] bg-[color:var(--panel-strong)] shadow-[0_20px_40px_-30px_rgba(111,210,255,0.5)]"
                        : "border-[color:var(--border)] bg-[color:var(--panel)] hover:bg-[color:var(--panel-strong)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${tone.className}`}
                          style={tone.style}
                        >
                          {Math.round(market.score)}
                        </span>
                        <span className="text-[11px] font-semibold text-[color:var(--ink-dim)]">
                          {market.mode}
                        </span>
                      </div>
                      <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--ink)]">
                        {stateLabel}
                      </span>
                    </div>
                    <div className="mt-3 text-sm font-semibold text-[color:var(--ink)]">
                      {market.question}
                    </div>
                    {hasMeta ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--ink-dim)]">
                        {market.restricted ? (
                          <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                            Restricted
                          </span>
                        ) : null}
                        {market.isExcluded ? (
                          <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-rose-200">
                            Excluded
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-[color:var(--ink-dim)]">
                      <div>
                        <div className="text-[10px] font-semibold text-[color:var(--ink-dim)]">
                          Expiry
                        </div>
                        <div className="mt-1 text-[color:var(--ink)]">
                          {market.expiryLabel ??
                            (market.daysToExpiry !== null
                              ? `${market.daysToExpiry}d`
                              : "—")}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-[color:var(--ink-dim)]">
                          Liquidity
                        </div>
                        <div className="mt-1 text-[color:var(--ink)]">
                          {formatMetric(market.liquidity)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-[color:var(--ink-dim)]">
                          Volume 24h
                        </div>
                        <div className="mt-1 text-[color:var(--ink)]">
                          {formatMetric(market.volume24h)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-[color:var(--ink-dim)]">
                          Open interest
                        </div>
                        <div className="mt-1 text-[color:var(--ink)]">
                          {formatMetric(market.openInterest)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {market.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag.slug}
                          className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-0.5 text-[11px] text-[color:var(--ink)]"
                        >
                          {tag.name}
                        </span>
                      ))}
                      {tagOverflow > 0 ? (
                        <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-0.5 text-[11px] text-[color:var(--ink-dim)]">
                          +{tagOverflow}
                        </span>
                      ) : null}
                      {(market.flags ?? []).slice(0, 1).map((flag) => (
                        <span
                          key={flag}
                          className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-200"
                        >
                          {flagLabel(flag)}
                        </span>
                      ))}
                      {flagOverflow > 0 ? (
                        <span className="rounded-full border border-rose-400/20 bg-rose-500/5 px-2 py-0.5 text-[11px] text-rose-200">
                          +{flagOverflow}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3">
                      <label className="text-[10px] font-semibold text-[color:var(--ink-dim)]">
                        State
                      </label>
                      <select
                        value={market.annotation?.state ?? "NEW"}
                        onChange={(event) => {
                          event.stopPropagation();
                          updateAnnotation(market.id, {
                            state: event.target.value,
                          });
                        }}
                        onClick={(event) => event.stopPropagation()}
                        className={`mt-2 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-[11px] font-semibold text-[color:var(--ink)] ${focusRing}`}
                      >
                        <option value="NEW">New</option>
                        <option value="ON_DECK">On Deck</option>
                        <option value="ACTIVE">Active</option>
                        <option value="ARCHIVE">Archive</option>
                      </select>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-6 hidden lg:block overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-y-3 text-sm">
              <thead>
                <tr>
                  <th className={`${tableHeadCell} text-right`}>Score</th>
                  <th className={tableHeadCell}>Mode</th>
                  <th className={tableHeadCell}>Market</th>
                  <th className={tableHeadCell}>Tags</th>
                  <th className={`${tableHeadCell} text-right`}>Expiry</th>
                  <th className={`${tableHeadCell} text-right`}>Liquidity</th>
                  <th className={`${tableHeadCell} text-right`}>Volume 24h</th>
                  <th className={`${tableHeadCell} text-right`}>Open interest</th>
                  <th className={tableHeadCell}>Flags</th>
                  <th className={tableHeadCell}>State</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={`skeleton-${index}`} className="group">
                      {Array.from({ length: 10 }).map((__, cellIndex) => (
                        <td
                          key={`skeleton-cell-${index}-${cellIndex}`}
                          className={`${rowCellBase} bg-[color:var(--panel)]`}
                        >
                          <div className="h-3 w-full max-w-[140px] animate-pulse rounded-full bg-[color:var(--panel-strong)] opacity-60" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : markets.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-[color:var(--ink-dim)]">
                      No markets match the current filters.
                    </td>
                  </tr>
                ) : (
                  markets.map((market) => {
                    const isSelected = selectedMarketId === market.id;
                    const tagOverflow = Math.max(0, market.tags.length - 3);
                    const flagOverflow = Math.max(0, market.flags.length - 2);
                    const hasMeta = market.restricted || market.isExcluded;
                    const topComponents = topScoreComponents(market.scoreComponents);

                    return (
                      <tr
                        key={market.id}
                        onClick={() => setSelectedMarketId(market.id)}
                        className="group cursor-pointer"
                      >
                        <td className={`${rowCell(isSelected)} text-right tabular-nums`}>
                          <div className="relative flex items-center justify-end gap-2 group/score">
                            {(() => {
                              const tone = scoreTone(market.score);
                              return (
                                <span
                                  className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${tone.className}`}
                                  style={tone.style}
                                >
                                  {Math.round(market.score)}
                                </span>
                              );
                            })()}
                            {topComponents.length ? (
                              <>
                                <button
                                  type="button"
                                  onClick={(event) => event.stopPropagation()}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  className={`flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] text-[10px] font-semibold text-[color:var(--ink)] ${focusRing}`}
                                  aria-label="Score details"
                                >
                                  i
                                </button>
                                <div className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-56 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-left text-[11px] text-[color:var(--ink-muted)] opacity-0 shadow-[0_18px_40px_-28px_rgba(2,6,23,0.8)] transition group-hover/score:opacity-100 group-focus-within/score:opacity-100">
                                  <div className="text-[10px] font-semibold text-[color:var(--ink-dim)]">
                                    Top signals
                                  </div>
                                  <ul className="mt-2 space-y-1">
                                    {topComponents.map((item) => (
                                      <li
                                        key={item.label}
                                        className="flex items-center justify-between gap-3 text-[color:var(--ink)]"
                                      >
                                        <span className="text-[color:var(--ink-muted)]">
                                          {item.label}
                                        </span>
                                        <span className="tabular-nums text-[color:var(--ink)]">
                                          {item.value}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </>
                            ) : null}
                          </div>
                        </td>
                        <td
                          className={`${rowCell(isSelected)} text-[11px] font-semibold tracking-[0.1em] text-[color:var(--ink-dim)]`}
                        >
                          {market.mode}
                        </td>
                        <td className={`${rowCell(isSelected)} text-[color:var(--ink)]`}>
                          <div className="max-w-sm text-sm font-semibold leading-snug text-[color:var(--ink)]">
                            {market.question}
                          </div>
                          {hasMeta ? (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--ink-dim)]">
                              {market.restricted ? (
                                <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                                  Restricted
                                </span>
                              ) : null}
                              {market.isExcluded ? (
                                <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-rose-200">
                                  Excluded
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                        <td className={rowCell(isSelected)}>
                          <div className="flex flex-wrap gap-1.5">
                            {market.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag.slug}
                                className="rounded-full border border-[color:var(--border)] bg-[color:var(--panel)] px-2 py-1 text-[11px] text-[color:var(--ink)]"
                              >
                                {tag.name}
                              </span>
                            ))}
                            {tagOverflow > 0 ? (
                              <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-[11px] text-[color:var(--ink-dim)]">
                                +{tagOverflow}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td
                          className={`${rowCell(isSelected)} text-right text-sm tabular-nums text-[color:var(--ink)]`}
                        >
                          {market.expiryLabel ??
                            (market.daysToExpiry !== null ? `${market.daysToExpiry}d` : "—")}
                        </td>
                        <td
                          className={`${rowCell(isSelected)} text-right text-sm tabular-nums text-[color:var(--ink)]`}
                        >
                          {formatMetric(market.liquidity)}
                        </td>
                        <td
                          className={`${rowCell(isSelected)} text-right text-sm tabular-nums text-[color:var(--ink)]`}
                        >
                          {formatMetric(market.volume24h)}
                        </td>
                        <td
                          className={`${rowCell(isSelected)} text-right text-sm tabular-nums text-[color:var(--ink)]`}
                        >
                          {formatMetric(market.openInterest)}
                        </td>
                        <td className={rowCell(isSelected)}>
                          <div className="flex flex-wrap gap-1.5">
                            {market.flags.slice(0, 2).map((flag) => (
                              <span
                                key={flag}
                                className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200"
                              >
                                {flagLabel(flag)}
                              </span>
                            ))}
                            {flagOverflow > 0 ? (
                              <span className="rounded-full border border-rose-400/20 bg-rose-500/5 px-2 py-1 text-[11px] text-rose-200">
                                +{flagOverflow}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className={rowCell(isSelected)}>
                          <select
                            value={market.annotation?.state ?? "NEW"}
                            onChange={(event) => {
                              event.stopPropagation();
                              updateAnnotation(market.id, {
                                state: event.target.value,
                              });
                            }}
                            onClick={(event) => event.stopPropagation()}
                            className={`rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-[11px] font-semibold text-[color:var(--ink)] ${focusRing}`}
                          >
                            <option value="NEW">New</option>
                            <option value="ON_DECK">On Deck</option>
                            <option value="ACTIVE">Active</option>
                            <option value="ARCHIVE">Archive</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })
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
