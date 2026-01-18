"use client";

import { useEffect, useState } from "react";

type TagItem = { slug: string; name: string };
type Score = {
  totalScore: number;
  components: Record<string, number>;
  flags: string[];
};
type Annotation = { state?: string; notes?: string; owner?: string };

type MarketDetail = {
  id: string;
  question: string;
  description?: string | null;
  endDate?: string | null;
  daysToExpiry?: number | null;
  mode?: "Memo" | "Thesis" | "Unknown";
  liquidity: number;
  volume24h: number;
  openInterest: number;
  tags: TagItem[];
  marketUrl?: string | null;
  restricted: boolean;
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

const formatMetric = (value: number) =>
  Number.isFinite(value) ? `$${formatCompact.format(value)}` : "—";

const formatCount = (value: number) =>
  Number.isFinite(value) ? formatCompact.format(value) : "—";

const flagLabel = (flag: string) =>
  flag
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

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
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 h-full w-full max-w-xl overflow-y-auto bg-white px-6 py-8 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Market detail
            </p>
            <h3 className="mt-3 font-[family-name:var(--font-display)] text-2xl text-zinc-900">
              {loading ? "Loading…" : market?.question}
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
              {market?.description || "No description provided."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-black/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-zinc-500"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl border border-black/10 bg-zinc-50 p-4 text-sm text-zinc-700">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Mode
            </div>
            <div className="mt-1 font-semibold text-zinc-900">{market?.mode}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Days to expiry
            </div>
            <div className="mt-1 font-semibold text-zinc-900">
              {market?.daysToExpiry ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Liquidity
            </div>
            <div className="mt-1 font-semibold text-zinc-900">
              {formatMetric(market?.liquidity ?? 0)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Volume 24h
            </div>
            <div className="mt-1 font-semibold text-zinc-900">
              {formatMetric(market?.volume24h ?? 0)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Open interest
            </div>
            <div className="mt-1 font-semibold text-zinc-900">
              {formatCount(market?.openInterest ?? 0)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Score
            </div>
            <div className="mt-1 font-semibold text-zinc-900">
              {Math.round(market?.score?.totalScore ?? 0)} / 100
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Score breakdown
          </h4>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-zinc-700">
            {Object.entries(components).map(([key, value]) => (
              <div
                key={key}
                className="rounded-xl border border-black/10 bg-white px-3 py-2"
              >
                <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  {key}
                </div>
                <div className="mt-1 font-semibold text-zinc-900">
                  {Number(value).toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Flags
          </h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {(market?.score?.flags ?? []).length === 0 ? (
              <span className="text-sm text-zinc-600">No flags.</span>
            ) : (
              (market?.score?.flags ?? []).map((flag) => (
                <span
                  key={flag}
                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs text-rose-700"
                >
                  {flagLabel(flag)}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Tags
          </h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {(market?.tags ?? []).map((tag) => (
              <span
                key={tag.slug}
                className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-zinc-700"
              >
                {tag.name}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Notes
          </h4>
          <div className="mt-3 space-y-3">
            <select
              value={draft.state ?? "NEW"}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, state: event.target.value }))
              }
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-800"
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
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-800"
              placeholder="Owner (optional)"
            />
            <textarea
              value={draft.notes ?? ""}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, notes: event.target.value }))
              }
              rows={4}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-800"
              placeholder="Add research notes..."
            />
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  if (!market) return;
                  onUpdateAnnotation(market.id, draft);
                }}
                className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white"
              >
                Save notes
              </button>
              {market?.marketUrl ? (
                <a
                  href={market.marketUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-700"
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
