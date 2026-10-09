import Link from "next/link";
import { DRILLS } from "@/lib/drills";
import { EXERCISE_KINDS } from "@/lib/types";

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-16">
      <header className="mb-10">
        <p className="text-sm uppercase tracking-[0.2em] text-accent">Ćwiczenia</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Polish practice</h1>
        <p className="mt-3 text-muted">Pick an exercise to set up.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {EXERCISE_KINDS.map((kind) => DRILLS[kind]).map((drill) => (
          <Link
            key={drill.route}
            href={drill.route}
            className="rounded-xl border border-line bg-surface px-5 py-5 transition-colors hover:border-accent/50"
          >
            <span className="block text-xs uppercase tracking-[0.2em] text-accent">{drill.pl}</span>
            <span className="mt-1 block text-lg font-medium">{drill.title}</span>
            <span className="mt-2 block text-sm text-muted">{drill.blurb}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
