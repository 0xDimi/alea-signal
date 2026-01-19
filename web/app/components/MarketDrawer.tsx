"use client";

import { useEffect, useState } from "react";

type TagItem = { slug: string; name: string };
type Score = {
  totalScore: number;
  components: Record<string, number>;
  flags: string[];
};
type Annotation = { state?: string; notes?: string; owner?: string };
type Outcome = { name: string; probability?: number | null };

type MarketDetail = {
  id: string;
  question: string;
  description?: string | null;
  endDate?: string | null;
  daysToExpiry?: number | null;
  expiryLabel?: string | null;
  mode?: "Memo" | "Thesis" | "Unknown";
  liquidity: number;
  volume24h: number;
  openInterest: number | null;
  tags: TagItem[];
  marketUrl?: string | null;
  restricted: boolean;
  outcomes?: Outcome[];
  score?: Score | null;
  annotation?: Annotation | null;
};

type Props = {
  marketId: string | null;
  onClose: () => void;
  onUpdateAnnotation: (marketId: string, payload: Annotation) => void;
};

const formatCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const formatMetric = (value?: number | null) =>
  Number.isFinite(value ?? NaN) ? `$${formatCompact.format(value ?? 0)}` : "—";

const formatCount = (value?: number | null) =>
  Number.isFinite(value ?? NaN) ? formatCompact.format(value ?? 0) : "—";

const formatProbability = (value?: number | null) => {
  if (!Number.isFinite(value ?? NaN)) return "—";
  const numeric = value ?? 0;
  const percent = numeric > 1 ? numeric : numeric * 100;
  return `${percent.toFixed(1)}%`;
};

const flagLabel = (flag: string) =>
  flag
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const componentLabelMap: Record<string, string> = {
  liquidity: "liquidity",
  volume24h: "recent volume",
  openInterest: "open interest",
  resolutionSource: "resolution source",
  endDate: "clear expiry",
  fit: "sector fit",
};

const buildScoreSummary = (score?: Score | null) => {
  if (!score) {
    return "Score reflects liquidity, volume, open interest, resolution source, and sector fit.";
  }
  const entries = Object.entries(score.components ?? {}).filter(
    ([key, value]) => key !== "penalties" && Number(value) > 0
  );
  const topSignals = entries
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 2)
    .map(([key]) => componentLabelMap[key] ?? key);
  const flagNotes =
    score.flags?.length && score.flags.length > 0
      ? score.flags.slice(0, 2).map(flagLabel).join(", ")
      : null;
  const lead = topSignals.length
    ? `Driven by ${topSignals.join(" and ")}.`
    : "Score reflects available market inputs.";
  return flagNotes ? `${lead} Watch: ${flagNotes}.` : lead;
};

export const MarketDrawer = ({ marketId, onClose, onUpdateAnnotation }: Props) => {
  const [market, setMarket] = useState<MarketDetail | null>(null);
  const [draft, setDraft] = useState<Annotation>({});
  const loading = Boolean(marketId && market?.id !== marketId);

  useEffect(() => {
    if (!marketId) return;
    fetch(`/api/markets/${marketId}`)
      .then((res) => res.json())
      .then((data) => {
        setMarket(data);
        setDraft({
          state: data.annotation?.state ?? "NEW",
          notes: data.annotation?.notes ?? "",
          owner: data.annotation?.owner ?? "",
        });
      })
      .catch((error) => {
        console.error(error);
      });
  }, [marketId]);

  if (!marketId) return null;

  const components = market?.score?.components ?? {};

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 h-full w-full max-w-xl overflow-y-auto bg-slate-950 px-6 py-8 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Market detail
            </p>
            <h3 className="mt-3 font-[family-name:var(--font-display)] text-2xl text-slate-100">
              {loading ? "Loading…" : market?.question}
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              {market?.description || "No description provided."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-200">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Mode
            </div>
            <div className="mt-1 font-semibold text-slate-100">{market?.mode}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Time to expiry
            </div>
            <div className="mt-1 font-semibold text-slate-100">
              {market?.expiryLabel ??
                (market?.daysToExpiry !== null && market?.daysToExpiry !== undefined
                  ? `${market?.daysToExpiry}d`
                  : "—")}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Liquidity
            </div>
            <div className="mt-1 font-semibold text-slate-100">
              {formatMetric(market?.liquidity ?? 0)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Volume 24h
            </div>
            <div className="mt-1 font-semibold text-slate-100">
              {formatMetric(market?.volume24h ?? 0)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Open interest
            </div>
            <div className="mt-1 font-semibold text-slate-100">
              {formatCount(market?.openInterest ?? null)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Score
            </div>
            <div className="mt-1 font-semibold text-slate-100">
              {Math.round(market?.score?.totalScore ?? 0)} / 100
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Score breakdown
          </h4>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-200">
            {Object.entries(components).map(([key, value]) => (
              <div
                key={key}
                className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2"
              >
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  {key}
                </div>
                <div className="mt-1 font-semibold text-slate-100">
                  {Number(value).toFixed(1)}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-300">
            {buildScoreSummary(market?.score ?? null)}
          </p>
        </div>

        <div className="mt-6">
          <h4 className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Flags
          </h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {(market?.score?.flags ?? []).length === 0 ? (
              <span className="text-sm text-slate-300">No flags.</span>
            ) : (
              (market?.score?.flags ?? []).map((flag) => (
                <span
                  key={flag}
                  className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-200"
                >
                  {flagLabel(flag)}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Outcomes
          </h4>
          <div className="mt-2 space-y-2 text-sm text-slate-200">
            {(market?.outcomes ?? []).length === 0 ? (
              <span className="text-sm text-slate-300">No outcomes available.</span>
            ) : (
              (market?.outcomes ?? []).map((outcome) => (
                <div
                  key={outcome.name}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2"
                >
                  <span className="font-medium text-slate-100">{outcome.name}</span>
                  <span className="text-slate-300">
                    {formatProbability(outcome.probability ?? null)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Tags
          </h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {(market?.tags ?? []).map((tag) => (
              <span
                key={tag.slug}
                className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 text-xs text-slate-200"
              >
                {tag.name}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Notes
          </h4>
          <div className="mt-3 space-y-3">
            <select
              value={draft.state ?? "NEW"}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, state: event.target.value }))
              }
              className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
            >
              <option value="NEW">New</option>
              <option value="ON_DECK">On Deck</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVE">Archive</option>
            </select>
            <input
              value={draft.owner ?? ""}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, owner: event.target.value }))
              }
              className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
              placeholder="Owner (optional)"
            />
            <textarea
              value={draft.notes ?? ""}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, notes: event.target.value }))
              }
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
              placeholder="Add research notes..."
            />
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  if (!market) return;
                  onUpdateAnnotation(market.id, draft);
                }}
                className="rounded-full bg-sky-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-950"
              >
                Save notes
              </button>
              {market?.marketUrl ? (
                <a
                  href={market.marketUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200"
                >
                  Open in Polymarket
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
