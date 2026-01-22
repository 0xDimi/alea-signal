"use client";

import { useEffect, useRef, useState } from "react";

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
  onUpdateAnnotation: (marketId: string, payload: Annotation) => Promise<void>;
};

const formatCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const formatMetric = (value?: number | null) =>
  Number.isFinite(value ?? NaN) ? `$${formatCompact.format(value ?? 0)}` : "—";

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
  resolutionIntegrity: "Resolution integrity",
  liquidityMicrostructure: "Liquidity & microstructure",
  modelability: "Modelability",
  participationQuality: "Participation quality",
  strategicFit: "Strategic fit",
  penalties: "Penalties",
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
  const [packSavedAt, setPackSavedAt] = useState<number | null>(null);
  const [notesSavedAt, setNotesSavedAt] = useState<number | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-soft)] focus-visible:border-transparent";
  const inputBase = `w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2.5 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--ink-dim)] ${focusRing}`;
  const inputCompact = `w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--ink-dim)] ${focusRing}`;
  const sectionCard =
    "rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--panel)] p-4";
  const loading = Boolean(marketId && market?.id !== marketId);

  useEffect(() => {
    if (!marketId) return;
    setPackSavedAt(null);
    setNotesSavedAt(null);
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

  useEffect(() => {
    if (!packSavedAt) return;
    const timeout = window.setTimeout(() => setPackSavedAt(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [packSavedAt]);

  useEffect(() => {
    if (!notesSavedAt) return;
    const timeout = window.setTimeout(() => setNotesSavedAt(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [notesSavedAt]);

  useEffect(() => {
    if (!marketId) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [marketId, onClose]);

  if (!marketId) return null;

  const components = market?.score?.components ?? {};
  const scoreHistory = market?.scoreHistory ?? [];
  const marketProbabilityValue = toNumber(packDraft?.marketProbability ?? "");
  const aleaProbabilityValue = toNumber(packDraft?.aleaProbability ?? "");
  const deltaValue =
    marketProbabilityValue !== null && aleaProbabilityValue !== null
      ? aleaProbabilityValue - marketProbabilityValue
      : null;
  const deltaLabel =
    deltaValue !== null ? `${deltaValue > 0 ? "+" : ""}${deltaValue.toFixed(1)} pts` : "—";
  const deltaTone =
    deltaValue === null
      ? "text-[color:var(--ink-dim)]"
      : deltaValue > 0
        ? "text-emerald-200"
        : deltaValue < 0
          ? "text-rose-200"
          : "text-[color:var(--ink)]";

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
        setPackSavedAt(Date.now());
      }
    } finally {
      setSavingPack(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!market) return;
    await onUpdateAnnotation(market.id, draft);
    setNotesSavedAt(Date.now());
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-[color:var(--canvas)] opacity-80 backdrop-blur-sm animate-[overlay-in_200ms_ease-out]"
        onClick={onClose}
      />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="market-drawer-title"
        className="relative z-10 h-full w-full max-w-xl overflow-y-auto bg-[color:var(--surface)] px-6 py-8 shadow-2xl animate-[drawer-in_200ms_ease-out]"
      >
        <div className="sticky top-0 z-20 -mx-6 mb-8 border-b border-[color:var(--border)] bg-[color:var(--surface-glass)] px-6 pb-6 pt-6 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-dim)]">
                Market detail
              </p>
              <h3
                id="market-drawer-title"
                className="mt-3 font-[family-name:var(--font-display)] text-2xl text-[color:var(--ink-strong)]"
              >
                {loading ? (
                  <span className="block h-6 w-3/4 animate-pulse rounded bg-[color:var(--panel-strong)]" />
                ) : (
                  market?.question
                )}
              </h3>
              <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
                {loading ? (
                  <span className="mt-2 block h-4 w-full max-w-md animate-pulse rounded bg-[color:var(--panel-strong)]" />
                ) : (
                  market?.description || "No description provided."
                )}
              </p>
            </div>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className={`flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--ink)] transition hover:border-[color:var(--accent-soft)] ${focusRing}`}
              aria-label="Close"
            >
              <span aria-hidden="true" className="text-sm font-semibold">
                X
              </span>
            </button>
          </div>

          <div
            className={`${sectionCard} mt-5 grid grid-cols-1 gap-4 text-sm text-[color:var(--ink-muted)] tabular-nums sm:grid-cols-2`}
          >
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-dim)]">
                Mode
              </div>
              <div className="mt-1 font-semibold text-[color:var(--ink)]">
                {market?.mode ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-dim)]">
                Time to expiry
              </div>
              <div className="mt-1 font-semibold text-[color:var(--ink)]">
                {market?.expiryLabel ??
                  (market?.daysToExpiry !== null && market?.daysToExpiry !== undefined
                    ? `${market?.daysToExpiry}d`
                    : "—")}
              </div>
            </div>
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-dim)]">
                Liquidity
              </div>
              <div className="mt-1 font-semibold text-[color:var(--ink)]">
                {formatMetric(market?.liquidity ?? 0)}
              </div>
            </div>
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-dim)]">
                Volume 24h
              </div>
              <div className="mt-1 font-semibold text-[color:var(--ink)]">
                {formatMetric(market?.volume24h ?? 0)}
              </div>
            </div>
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-dim)]">
                Open interest
              </div>
              <div className="mt-1 font-semibold text-[color:var(--ink)]">
                {formatMetric(market?.openInterest ?? null)}
              </div>
            </div>
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-dim)]">
                Score
              </div>
              <div className="mt-1 font-semibold text-[color:var(--ink)]">
                {Math.round(market?.score?.totalScore ?? 0)} / 100
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-xs font-semibold text-[color:var(--ink-muted)]">
            Probability box
          </h4>
          {packDraft ? (
            <div className={`${sectionCard} mt-3 text-sm text-[color:var(--ink-muted)]`}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-semibold text-[color:var(--ink-dim)]">
                    Market (%)
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
                    className={`mt-2 ${inputCompact}`}
                    placeholder="Market probability"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[color:var(--ink-dim)]">
                    Alea (%)
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
                    className={`mt-2 ${inputCompact}`}
                    placeholder="Alea probability"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[color:var(--ink-dim)]">
                    Delta (Alea - Market)
                  </label>
                  <div
                    className={`mt-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm font-semibold tabular-nums ${deltaTone}`}
                  >
                    {deltaLabel}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[color:var(--ink-dim)]">
                    Confidence
                  </label>
                  <select
                    value={packDraft.confidence}
                    onChange={(event) =>
                      setPackDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              confidence: event.target.value as ResearchPackDraft["confidence"],
                            }
                          : prev
                      )
                    }
                    className={`mt-2 ${inputCompact}`}
                  >
                    <option value="">Select</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[color:var(--ink-dim)]">
                    Decision
                  </label>
                  <select
                    value={packDraft.decision}
                    onChange={(event) =>
                      setPackDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              decision: event.target.value as ResearchPackDraft["decision"],
                            }
                          : prev
                      )
                    }
                    className={`mt-2 ${inputCompact}`}
                  >
                    <option value="">Select</option>
                    <option value="YES">Yes</option>
                    <option value="NO">No</option>
                    <option value="PASS">Pass</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[color:var(--ink-dim)]">
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
                    className={`mt-2 ${inputCompact}`}
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="text-[11px] font-semibold text-[color:var(--ink-dim)]">
                  Next catalyst note
                </label>
                <input
                  value={packDraft.nextCatalystNote}
                  onChange={(event) =>
                    setPackDraft((prev) =>
                      prev ? { ...prev, nextCatalystNote: event.target.value } : prev
                    )
                  }
                  className={`mt-2 ${inputBase}`}
                  placeholder="What moves the probability next?"
                />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[color:var(--ink-muted)]">
              Loading research pack…
            </p>
          )}
        </div>

        <div className="mt-6">
          <h4 className="text-xs font-semibold text-[color:var(--ink-muted)]">
            Score breakdown
          </h4>
          <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-[color:var(--ink-muted)] sm:grid-cols-2">
            {Object.entries(components).map(([key, value]) => (
              <div
                key={key}
                className="rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2"
              >
                <div className="text-[11px] font-semibold tracking-[0.08em] text-[color:var(--ink-dim)]">
                  {componentLabelMap[key] ?? key}
                </div>
                <div className="mt-1 font-semibold text-[color:var(--ink)]">
                  {Number(value).toFixed(1)}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-[color:var(--ink-dim)]">
            {buildScoreSummary(market?.score ?? null)}
          </p>
        </div>

        <div className="mt-6">
          <h4 className="text-xs font-semibold text-[color:var(--ink-muted)]">
            Research pack
          </h4>
          {packDraft ? (
            <div className="mt-3 space-y-4 text-sm text-[color:var(--ink-muted)]">
              <div>
                <label className="text-[11px] font-semibold text-[color:var(--ink-dim)]">
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
                  className={`mt-2 ${inputBase}`}
                  placeholder="YES conditions, NO conditions, edge cases..."
                />
              </div>
              <details
                open
                className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
              >
                <summary
                  className={`flex cursor-pointer items-center justify-between text-xs font-semibold text-[color:var(--ink-muted)] ${focusRing}`}
                >
                  <span>Sources & evidence</span>
                  <span className="text-[10px] text-[color:var(--ink-dim)]">Details</span>
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-[11px] font-semibold text-[color:var(--ink-dim)]">
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
                      className={`mt-2 ${inputBase}`}
                      placeholder="Primary sources and datasets"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[color:var(--ink-dim)]">
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
                      className={`mt-2 ${inputBase}`}
                      placeholder="Data points to confirm"
                    />
                  </div>
                </div>
              </details>
              <details
                open
                className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
              >
                <summary
                  className={`flex cursor-pointer items-center justify-between text-xs font-semibold text-[color:var(--ink-muted)] ${focusRing}`}
                >
                  <span>Drivers & risks</span>
                  <span className="text-[10px] text-[color:var(--ink-dim)]">Details</span>
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-[11px] font-semibold text-[color:var(--ink-dim)]">
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
                      className={`mt-2 ${inputBase}`}
                      placeholder="Indicators to monitor"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[color:var(--ink-dim)]">
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
                      className={`mt-2 ${inputBase}`}
                      placeholder="Model or resolution risks"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold text-[color:var(--ink-dim)]">
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
                      className={`mt-2 ${inputBase}`}
                      placeholder="Catalysts and market-moving events"
                    />
                  </div>
                </div>
              </details>
              <div className="flex items-center gap-3">
                <button
                  onClick={saveResearchPack}
                  className={`rounded-full bg-[color:var(--accent)] px-4 py-2.5 text-[11px] font-semibold text-slate-950 transition hover:bg-[color:var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
                  disabled={savingPack}
                >
                  {savingPack ? "Saving…" : "Save research pack"}
                </button>
                {packSavedAt ? (
                  <span className="text-xs font-semibold text-emerald-200">
                    Saved
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-[color:var(--ink-dim)]">
                Updates the probability box, sources, indicators, and risks.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[color:var(--ink-muted)]">
              Loading research pack…
            </p>
          )}
        </div>

        <div className="mt-6">
          <h4 className="text-xs font-semibold text-[color:var(--ink-muted)]">
            Score history
          </h4>
          <div className="mt-2 space-y-2 text-sm text-[color:var(--ink-muted)]">
            {scoreHistory.length === 0 ? (
              <span className="text-sm text-[color:var(--ink-dim)]">No history yet.</span>
            ) : (
              scoreHistory.map((entry) => (
                <div
                  key={`${entry.computedAt}-${entry.totalScore}`}
                  className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2"
                >
                  <span className="text-[color:var(--ink-muted)]">
                    {new Date(entry.computedAt).toLocaleString()}
                  </span>
                  <span className="font-semibold text-[color:var(--ink)]">
                    {Math.round(entry.totalScore)}{" "}
                    <span className="text-xs text-[color:var(--ink-dim)]">
                      {entry.scoreVersion ? entry.scoreVersion.toUpperCase() : ""}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-xs font-semibold text-[color:var(--ink-muted)]">Flags</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {(market?.score?.flags ?? []).length === 0 ? (
              <span className="text-sm text-[color:var(--ink-dim)]">No flags.</span>
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
          <h4 className="text-xs font-semibold text-[color:var(--ink-muted)]">
            Outcomes
          </h4>
          <div className="mt-2 space-y-2 text-sm text-[color:var(--ink-muted)]">
            {(market?.outcomes ?? []).length === 0 ? (
              <span className="text-sm text-[color:var(--ink-dim)]">
                No outcomes available.
              </span>
            ) : (
              (market?.outcomes ?? []).map((outcome) => (
                <div
                  key={outcome.name}
                  className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2"
                >
                  <span className="font-medium text-[color:var(--ink)]">
                    {outcome.name}
                  </span>
                  <span className="text-[color:var(--ink-muted)]">
                    {formatProbability(outcome.probability ?? null)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-xs font-semibold text-[color:var(--ink-muted)]">Tags</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {(market?.tags ?? []).map((tag) => (
              <span
                key={tag.slug}
                className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1 text-xs text-[color:var(--ink)]"
              >
                {tag.name}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-xs font-semibold text-[color:var(--ink-muted)]">Notes</h4>
          <div className="mt-3 space-y-3">
            <select
              value={draft.state ?? "NEW"}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, state: event.target.value }))
              }
              className={inputBase}
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
              className={inputBase}
              placeholder="Owner (optional)"
            />
            <textarea
              value={draft.notes ?? ""}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, notes: event.target.value }))
              }
              rows={4}
              className={inputBase}
              placeholder="Add research notes..."
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleSaveNotes}
                className={`rounded-full bg-[color:var(--accent)] px-4 py-2.5 text-[11px] font-semibold text-slate-950 transition hover:bg-[color:var(--accent-strong)] ${focusRing}`}
              >
                Save notes
              </button>
              {notesSavedAt ? (
                <span className="text-xs font-semibold text-emerald-200">
                  Saved
                </span>
              ) : null}
              {market?.marketUrl ? (
                <a
                  href={market.marketUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`rounded-full border border-[color:var(--border)] px-4 py-2.5 text-[11px] font-semibold text-[color:var(--ink-dim)] transition hover:border-[color:var(--accent-soft)] hover:text-[color:var(--ink)] ${focusRing}`}
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
