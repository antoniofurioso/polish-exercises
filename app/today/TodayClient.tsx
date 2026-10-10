"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AccessGate } from "@/components/AccessGate";
import { SyncOnFinish } from "@/components/account";
import { Runner } from "@/components/Runner";
import { GoalStatus } from "@/components/today";
import { dayKey } from "@/lib/srs";
import {
  readProgress,
  readSettings,
  readTodaySession,
  saveTodaySession,
  useHydrated,
} from "@/lib/storage";
import { buildToday, daySeed, type RunState, type TodayPlan } from "@/lib/today";

/**
 * Today's practice: no configurator and no URL config. The session is built
 * from a snapshot of the stored progress taken once, when the page mounts
 * (plans/phase-2.md §6), so answering does not reshuffle the session under the
 * learner. "Another round" takes a fresh snapshot. The session is saved after
 * every answer (lib/storage.ts), so leaving midway and coming back the same day
 * continues from the next unanswered question. With accounts on, `AccessGate`
 * decides first whether the learner may practise.
 */
export function TodayPage() {
  return (
    <AccessGate from="today">
      <Today />
    </AccessGate>
  );
}

function Today() {
  const hydrated = useHydrated();
  // the saved session's round, so a later round resumes as itself (0 without one)
  const [round, setRound] = useState(savedRound);

  if (!hydrated) {
    return (
      <Shell>
        <p className="text-muted">Picking today’s questions…</p>
      </Shell>
    );
  }
  return <TodaySession key={round} round={round} onAnotherRound={() => setRound((r) => r + 1)} />;
}

function savedRound(): number {
  try {
    return typeof window === "undefined" ? 0 : (readTodaySession(dayKey(Date.now()))?.round ?? 0);
  } catch {
    return 0;
  }
}

type Built = { plan: TodayPlan; day: string; resume?: RunState } | { error: true };

function TodaySession({ round, onAnotherRound }: { round: number; onAnotherRound: () => void }) {
  const [built] = useState<Built>(() => {
    try {
      const now = Date.now();
      const day = dayKey(now);
      const saved = readTodaySession(day);
      if (saved && saved.round === round) return { plan: saved.plan, day, resume: saved.run };
      const settings = readSettings();
      const plan = buildToday(readProgress(), now, daySeed(day) + round, { settings });
      return { plan, day };
    } catch {
      return { error: true };
    }
  });

  if ("error" in built) {
    return (
      <Shell>
        <h1 className="page-title">Today’s practice isn’t ready</h1>
        <p className="mt-3 text-muted">
          Something went wrong putting the session together. Pick an exercise from the menu
          instead; your answers there still count toward your progress.
        </p>
        <HomeLink />
      </Shell>
    );
  }

  const { plan, day, resume } = built;
  if (plan.exercises.length === 0) {
    return (
      <Shell>
        <h1 className="page-title">Nothing to practise right now</h1>
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
      homeLabel="Back home"
      reaskWrong
      source="today"
      resume={resume}
      onProgress={(run) => saveTodaySession({ v: 1, day, round, plan, run })}
      summaryExtra={
        <div className="space-y-3">
          <SyncOnFinish />
          <p className="text-sm font-medium text-muted">{planSummary(plan)}</p>
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
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
        <Link href="/learn" className="icon-btn" aria-label="Back home">
          <X size={20} aria-hidden="true" />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6 sm:pt-12">{children}</main>
    </div>
  );
}

function HomeLink() {
  return (
    <Link href="/learn" className="btn btn-secondary mt-7">
      Back home
    </Link>
  );
}
