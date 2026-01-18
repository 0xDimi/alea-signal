import { Screener } from "@/app/components/Screener";

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-40 top-10 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_top,#f7b267_0%,transparent_70%)] opacity-70" />
        <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_top,#1b998b_0%,transparent_70%)] opacity-50" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-96 w-96 -translate-y-1/3 rounded-full bg-[radial-gradient(circle_at_top,#f25f5c_0%,transparent_70%)] opacity-40" />

        <main className="relative mx-auto max-w-7xl px-6 pb-20 pt-16">
          <header className="mb-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
            <div>
              <p className="text-xs uppercase tracking-[0.45em] text-zinc-500">
                Alea Market Screener
              </p>
              <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-zinc-900 sm:text-5xl">
                Researchability Score
              </h1>
              <p className="mt-4 max-w-2xl text-base text-zinc-600">
                A focused signal stack for Polymarket: prioritize crypto,
                finance, and economy markets with clear rules, active liquidity,
                and fast editorial alignment.
              </p>
            </div>
            <div className="rounded-3xl border border-black/10 bg-white/80 p-6 text-sm text-zinc-600 shadow-[0_20px_80px_-60px_rgba(0,0,0,0.6)] backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
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
