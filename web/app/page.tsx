import { Screener } from "@/app/components/Screener";

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-40 top-10 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_top,#1d4ed8_0%,transparent_70%)] opacity-50" />
        <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_top,#38bdf8_0%,transparent_70%)] opacity-35" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-96 w-96 -translate-y-1/3 rounded-full bg-[radial-gradient(circle_at_top,#0ea5e9_0%,transparent_70%)] opacity-35" />

        <main className="relative mx-auto max-w-7xl px-6 pb-20 pt-16">
          <header className="mb-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
            <div>
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.45em] text-slate-400">
                <img
                  src="/polymarket-mark.svg"
                  alt="Polymarket"
                  className="h-6 w-6"
                />
                <span>Alea Market Screener</span>
              </div>
              <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-slate-100 sm:text-5xl">
                Researchability Score
              </h1>
              <p className="mt-4 max-w-2xl text-base text-slate-300">
                A focused signal stack for Polymarket: prioritize crypto,
                finance, and economy markets with clear rules, active liquidity,
                and fast editorial alignment.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 text-sm text-slate-200 shadow-[0_20px_80px_-60px_rgba(2,6,23,0.6)] backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Workflow
              </p>
              <p className="mt-3">
                Move markets from <span className="font-semibold">New</span> to{" "}
                <span className="font-semibold">On Deck</span> and{" "}
                <span className="font-semibold">Active</span> as coverage moves
                through the pipeline.
              </p>
            </div>
          </header>

          <Screener />
        </main>
      </div>
    </div>
  );
}
