import Image from "next/image";

import { Screener } from "@/app/components/Screener";

export default function Home() {
  return (
    <div className="min-h-screen text-[var(--ink)]">
      <div className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute -left-24 top-8 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_top,#1d4ed8_0%,transparent_70%)] opacity-35 blur-2xl" />

        <main className="relative mx-auto w-full max-w-none px-6 pb-20 pt-16 animate-[fade-in_500ms_ease-out]">
          <header className="mb-14 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
            <div>
              <div className="mb-4 flex items-center gap-3">
                <Image
                  src="/alea-logo-white.png"
                  alt="Alea"
                  width={96}
                  height={28}
                  className="h-7 w-auto opacity-90"
                />
              </div>
              <div className="inline-flex items-center gap-3 rounded-full border border-[color:var(--border)] bg-[color:var(--panel-glass)] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-dim)] backdrop-blur">
                <Image
                  src="/polymarket-mark.svg"
                  alt="Polymarket"
                  width={20}
                  height={20}
                  className="h-5 w-5"
                />
                <span>Alea Market Screener</span>
              </div>
              <h1 className="mt-5 font-[family-name:var(--font-display)] text-4xl text-[color:var(--ink-strong)] sm:text-5xl lg:text-6xl">
                Researchability Score
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-[color:var(--ink-muted)]">
                A focused signal stack for Polymarket: prioritize crypto,
                finance, and economy markets with clear rules, active liquidity,
                and fast editorial alignment.
              </p>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--panel-glass)] p-6 text-sm text-[color:var(--ink-muted)] shadow-[var(--shadow-panel)] backdrop-blur">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-dim)]">
                Workflow
              </p>
              <p className="mt-3 leading-relaxed">
                Move markets from New to On Deck and Active as coverage moves
                through the pipeline.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold text-[color:var(--ink)]">
                {["New", "On Deck", "Active"].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-1"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </header>

          <Screener />
        </main>
      </div>
    </div>
  );
}
