"use client";

import Link from "next/link";
import { useState } from "react";
import { Runner } from "@/components/Runner";
import { GoalStatus } from "@/components/today";
import { dayKey } from "@/lib/srs";
import { readProgress, readSettings, useHydrated } from "@/lib/storage";
import { buildToday, daySeed, type TodayPlan } from "@/lib/today";

/**
 * Today's practice: no configurator and no URL config. The session is built
 * from a snapshot of the stored progress taken once, when the page mounts
 * (plans/phase-2.md §6), so answering does not reshuffle the session under the
 * learner. "Another round" takes a fresh snapshot.
 */
export function TodayPage() {
  const hydrated = useHydrated();
  const [round, setRound] = useState(0);

  if (!hydrated) {
    return (
      <Shell>
        <p className="text-muted">Picking today’s questions…</p>
      </Shell>
    );
  }
  return <TodaySession key={round} round={round} onAnotherRound={() => setRound((r) => r + 1)} />;
}

type Built = { plan: TodayPlan } | { error: true };

function TodaySession({ round, onAnotherRound }: { round: number; onAnotherRound: () => void }) {
  const [built] = useState<Built>(() => {
    try {
      const now = Date.now();
      const settings = readSettings();
      const plan = buildToday(readProgress(), now, daySeed(dayKey(now)) + round, { settings });
      return { plan };
    } catch {
      return { error: true };
    }
  });

  if ("error" in built) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">Today’s practice isn’t ready</h1>
        <p className="mt-3 text-muted">
          Something went wrong putting the session together. Pick an exercise from the menu
          instead; your answers there still count toward your progress.
        </p>
        <HomeLink />
      </Shell>
    );
  }

  const { plan } = built;
  if (plan.exercises.length === 0) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">Nothing to practise right now</h1>
        <p className="mt-3 text-muted">
          There are no reviews due and no new words to introduce. Pick an exercise from the menu
          to keep going.
        </p>
        <HomeLink />
      </Shell>
    );
  }

  return (
    <Runner
      exercises={plan.exercises}
      kind="shuffle"
      home="/learn"
      onRestart={onAnotherRound}
      restartLabel="Another round"
      homeLabel="Back to the menu"
      reaskWrong
      summaryExtra={
        <div className="space-y-3">
          <p className="text-sm text-muted">{planSummary(plan)}</p>
          <GoalStatus />
        </div>
      }
    />
  );
}

/** "12 reviews, 8 new words" / "Extra practice: 20 questions on your weak spots". */
function planSummary(plan: TodayPlan): string {
  if (plan.extraOnly) return `Extra practice: ${plan.exercises.length} questions on your weakest spots.`;
  const parts: string[] = [];
  if (plan.due) parts.push(`${plan.due} ${plan.due === 1 ? "review" : "reviews"}`);
  if (plan.fresh) parts.push(`${plan.fresh} new`);
  if (plan.extra) parts.push(`${plan.extra} extra`);
  return `Today’s practice${parts.length ? `: ${parts.join(", ")}` : ""}.`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-14">
      <Link href="/learn" className="text-sm uppercase tracking-[0.2em] text-accent">
        Ćwiczenia
      </Link>
      <div className="mt-8">{children}</div>
    </main>
  );
}

function HomeLink() {
  return (
    <Link
      href="/learn"
      className="mt-6 inline-block rounded-xl border border-line bg-surface px-6 py-3 font-medium hover:border-accent/50"
    >
      Back to the menu
    </Link>
  );
}
