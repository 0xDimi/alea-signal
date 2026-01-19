"use client";

import { useEffect, useState } from "react";

type TagItem = { slug: string; name: string };
type Score = {
  totalScore: number;
  components: Record<string, number>;
  flags: string[];
  scoreVersion?: string;
};
type Annotation = { state?: string; notes?: string; owner?: string };
type Outcome = { name: string; probability?: number | null };
type ScoreHistory = {
  totalScore: number;
  computedAt: string;
  scoreVersion?: string | null;
};
type ResearchPack = {
  marketProbability?: number | null;
  aleaProbability?: number | null;
  delta?: number | null;
  confidence?: "HIGH" | "MEDIUM" | "LOW" | null;
  decision?: "YES" | "NO" | "PASS" | null;
  nextCatalystDate?: string | null;
  nextCatalystNote?: string | null;
  resolutionRules?: string | null;
  sources?: string[] | null;
  evidenceChecklist?: string[] | null;
  leadingIndicators?: string[] | null;
  keyRisks?: string[] | null;
  marketDrivers?: string[] | null;
};
type ResearchPackDraft = {
  marketProbability: string;
  aleaProbability: string;
  confidence: "" | "HIGH" | "MEDIUM" | "LOW";
  decision: "" | "YES" | "NO" | "PASS";
  nextCatalystDate: string;
  nextCatalystNote: string;
  resolutionRules: string;
  sources: string;
  evidenceChecklist: string;
  leadingIndicators: string;
  keyRisks: string;
  marketDrivers: string;
};

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
  researchPack?: ResearchPack | null;
  scoreHistory?: ScoreHistory[];
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
  resolutionIntegrity: "resolution integrity",
  liquidityMicrostructure: "liquidity & microstructure",
  modelability: "modelability",
  participationQuality: "participation quality",
  strategicFit: "strategic fit",
  penalties: "penalties",
};

const buildScoreSummary = (score?: Score | null) => {
  if (!score) {
    return "Score reflects resolution integrity, liquidity, modelability, participation quality, and strategic fit.";
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

const listToText = (list?: string[] | null) => (list && list.length ? list.join("\n") : "");

const parseList = (value: string) =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

const toNumber = (value: string) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

export const MarketDrawer = ({ marketId, onClose, onUpdateAnnotation }: Props) => {
  const [market, setMarket] = useState<MarketDetail | null>(null);
  const [draft, setDraft] = useState<Annotation>({});
  const [packDraft, setPackDraft] = useState<ResearchPackDraft | null>(null);
  const [savingPack, setSavingPack] = useState(false);
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
        const pack = data.researchPack ?? {};
        setPackDraft({
          marketProbability:
            pack.marketProbability !== null && pack.marketProbability !== undefined
              ? String(pack.marketProbability)
              : "",
          aleaProbability:
            pack.aleaProbability !== null && pack.aleaProbability !== undefined
              ? String(pack.aleaProbability)
              : "",
          confidence: pack.confidence ?? "",
          decision: pack.decision ?? "",
          nextCatalystDate: pack.nextCatalystDate ?? "",
          nextCatalystNote: pack.nextCatalystNote ?? "",
          resolutionRules: pack.resolutionRules ?? "",
          sources: listToText(pack.sources ?? []),
          evidenceChecklist: listToText(pack.evidenceChecklist ?? []),
          leadingIndicators: listToText(pack.leadingIndicators ?? []),
          keyRisks: listToText(pack.keyRisks ?? []),
          marketDrivers: listToText(pack.marketDrivers ?? []),
        });
      })
      .catch((error) => {
        console.error(error);
      });
  }, [marketId]);

  if (!marketId) return null;

  const components = market?.score?.components ?? {};
  const scoreHistory = market?.scoreHistory ?? [];
  const marketProbabilityValue = toNumber(packDraft?.marketProbability ?? "");
  const aleaProbabilityValue = toNumber(packDraft?.aleaProbability ?? "");
  const deltaValue =
    marketProbabilityValue !== null && aleaProbabilityValue !== null
      ? aleaProbabilityValue - marketProbabilityValue
      : null;

  const saveResearchPack = async () => {
    if (!market || !packDraft) return;
    setSavingPack(true);
    try {
      const res = await fetch(`/api/markets/${market.id}/research-pack`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketProbability: toNumber(packDraft.marketProbability),
          aleaProbability: toNumber(packDraft.aleaProbability),
          confidence: packDraft.confidence || null,
          decision: packDraft.decision || null,
          nextCatalystDate: packDraft.nextCatalystDate || null,
          nextCatalystNote: packDraft.nextCatalystNote || null,
          resolutionRules: packDraft.resolutionRules || null,
          sources: parseList(packDraft.sources),
          evidenceChecklist: parseList(packDraft.evidenceChecklist),
          leadingIndicators: parseList(packDraft.leadingIndicators),
          keyRisks: parseList(packDraft.keyRisks),
          marketDrivers: parseList(packDraft.marketDrivers),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMarket((prev) => (prev ? { ...prev, researchPack: data.researchPack } : prev));
      }
    } finally {
      setSavingPack(false);
    }
  };

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
            Alea Probability Box
          </h4>
          {packDraft ? (
            <div className="mt-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-200">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    Pm (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={packDraft.marketProbability}
                    onChange={(event) =>
                      setPackDraft((prev) =>
                        prev ? { ...prev, marketProbability: event.target.value } : prev
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                    placeholder="Market probability"
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    Pa (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={packDraft.aleaProbability}
                    onChange={(event) =>
                      setPackDraft((prev) =>
                        prev ? { ...prev, aleaProbability: event.target.value } : prev
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                    placeholder="Alea probability"
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    Delta
                  </label>
                  <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100">
                    {deltaValue !== null ? `${deltaValue.toFixed(1)} pts` : "—"}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    Confidence
                  </label>
                  <select
                    value={packDraft.confidence}
                    onChange={(event) =>
                      setPackDraft((prev) =>
                        prev ? { ...prev, confidence: event.target.value as ResearchPackDraft["confidence"] } : prev
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="">Select</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    Decision
                  </label>
                  <select
                    value={packDraft.decision}
                    onChange={(event) =>
                      setPackDraft((prev) =>
                        prev ? { ...prev, decision: event.target.value as ResearchPackDraft["decision"] } : prev
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="">Select</option>
                    <option value="YES">Yes</option>
                    <option value="NO">No</option>
                    <option value="PASS">Pass</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    Next catalyst date
                  </label>
                  <input
                    type="date"
                    value={packDraft.nextCatalystDate}
                    onChange={(event) =>
                      setPackDraft((prev) =>
                        prev ? { ...prev, nextCatalystDate: event.target.value } : prev
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  Next catalyst note
                </label>
                <input
                  value={packDraft.nextCatalystNote}
                  onChange={(event) =>
                    setPackDraft((prev) =>
                      prev ? { ...prev, nextCatalystNote: event.target.value } : prev
                    )
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                  placeholder="What moves the probability next?"
                />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-300">Loading research pack…</p>
          )}
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
                  {componentLabelMap[key] ?? key}
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
            Research pack
          </h4>
          {packDraft ? (
            <div className="mt-3 space-y-3 text-sm text-slate-200">
              <div>
                <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  Resolution rules (truth table)
                </label>
                <textarea
                  value={packDraft.resolutionRules}
                  onChange={(event) =>
                    setPackDraft((prev) =>
                      prev ? { ...prev, resolutionRules: event.target.value } : prev
                    )
                  }
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                  placeholder="YES conditions, NO conditions, edge cases..."
                />
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    Sources (one per line)
                  </label>
                  <textarea
                    value={packDraft.sources}
                    onChange={(event) =>
                      setPackDraft((prev) =>
                        prev ? { ...prev, sources: event.target.value } : prev
                      )
                    }
                    rows={4}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                    placeholder="Primary sources and datasets"
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    Evidence checklist (one per line)
                  </label>
                  <textarea
                    value={packDraft.evidenceChecklist}
                    onChange={(event) =>
                      setPackDraft((prev) =>
                        prev ? { ...prev, evidenceChecklist: event.target.value } : prev
                      )
                    }
                    rows={4}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                    placeholder="Data points to confirm"
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    Leading indicators (one per line)
                  </label>
                  <textarea
                    value={packDraft.leadingIndicators}
                    onChange={(event) =>
                      setPackDraft((prev) =>
                        prev ? { ...prev, leadingIndicators: event.target.value } : prev
                      )
                    }
                    rows={4}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                    placeholder="Indicators to monitor"
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    Key risks (one per line)
                  </label>
                  <textarea
                    value={packDraft.keyRisks}
                    onChange={(event) =>
                      setPackDraft((prev) =>
                        prev ? { ...prev, keyRisks: event.target.value } : prev
                      )
                    }
                    rows={4}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                    placeholder="Model or resolution risks"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  What moves the market (one per line)
                </label>
                <textarea
                  value={packDraft.marketDrivers}
                  onChange={(event) =>
                    setPackDraft((prev) =>
                      prev ? { ...prev, marketDrivers: event.target.value } : prev
                    )
                  }
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                  placeholder="Catalysts and market-moving events"
                />
              </div>
              <button
                onClick={saveResearchPack}
                className="rounded-full bg-sky-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-950"
                disabled={savingPack}
              >
                {savingPack ? "Saving…" : "Save research pack"}
              </button>
              <p className="text-xs text-slate-400">
                Updates the probability box, sources, indicators, and risks.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-300">Loading research pack…</p>
          )}
        </div>

        <div className="mt-6">
          <h4 className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Score history
          </h4>
          <div className="mt-2 space-y-2 text-sm text-slate-200">
            {scoreHistory.length === 0 ? (
              <span className="text-sm text-slate-300">No history yet.</span>
            ) : (
              scoreHistory.map((entry) => (
                <div
                  key={`${entry.computedAt}-${entry.totalScore}`}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2"
                >
                  <span className="text-slate-300">
                    {new Date(entry.computedAt).toLocaleString()}
                  </span>
                  <span className="font-semibold text-slate-100">
                    {Math.round(entry.totalScore)}{" "}
                    <span className="text-xs text-slate-400">
                      {entry.scoreVersion ? entry.scoreVersion.toUpperCase() : ""}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
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
