"use client";

import { Flame, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { AppPage } from "@/components/AppShell";
import { ActivityGrid, WeakSpotList } from "@/components/progress";
import { GoalRing, useTodayStatus } from "@/components/today";
import { weakSpots, type WeakSpot } from "@/lib/progress";
import { lastDays, safely } from "@/lib/progressView";

/** Streak, today's goal, the last 28 days and weak spots (plans/phase-2.md §7–8). The settings are on /settings. */
export function ProgressPage() {
  const status = useTodayStatus();
  const { hydrated, ready, progress, now, streak } = status;

  const days = useMemo(() => (hydrated ? lastDays(progress.days, now, 28) : []), [hydrated, progress, now]);
  const weak = useMemo<WeakSpot[] | null>(
    () => (hydrated && ready ? safely(() => weakSpots(progress, now), null) : null),
    [hydrated, ready, progress, now],
  );

  return (
    <AppPage
      title="Your progress"
      intro="Your streak, your daily goal and where you slip up most."
      action={
        <Link href="/settings" className="btn btn-secondary btn-sm">
          <SlidersHorizontal size={16} aria-hidden="true" />
          Daily goal
        </Link>
      }
    >
      {!hydrated ? (
        <p className="text-muted">Loading your progress…</p>
      ) : (
        <div className="space-y-4">
          {!ready ? (
            <p className="rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn">
              Your progress can’t be read on this device right now. Practice still works.
            </p>
          ) : null}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="card flex items-center gap-5 p-6">
              <GoalRing answered={status.answered} goal={status.goal} size={84} />
              <div>
                <p className="label-caps">Today</p>
                <p className="mt-1 font-semibold">
                  {status.answered >= status.goal
                    ? "Daily goal reached"
                    : `${status.answered} of ${status.goal} questions`}
                </p>
                <Link href="/today" className="link text-sm">
                  Today’s practice →
                </Link>
              </div>
            </div>
            <div className="card p-6">
              <p className="label-caps flex items-center gap-2">
                <Flame size={16} className="text-accent" aria-hidden="true" />
                Streak
              </p>
              {streak ? (
                <>
                  <p className="mt-2 text-4xl font-bold tracking-tight text-accent">
                    {streak.current}{" "}
                    <span className="text-base font-medium text-muted">{streak.current === 1 ? "day" : "days"}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Best {streak.best} · {streak.today ? "today counts" : "meet today’s goal to extend it"}
                  </p>
                  {streak.graceUsed ? (
                    <p className="mt-1 text-sm text-warn">A grace day is holding your streak: don’t miss today.</p>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-muted">Not available yet.</p>
              )}
            </div>
          </section>

          <section aria-labelledby="days-title" className="card p-6">
            <h2 id="days-title" className="text-[1.0625rem] font-semibold">
              The last 4 weeks
            </h2>
            <p className="mt-1 text-sm text-muted">Questions answered each day; the darkest squares met the goal.</p>
            <div className="mt-5 max-w-xs">
              <ActivityGrid days={days} goal={status.goal} />
            </div>
          </section>

          <section id="weak" aria-labelledby="weak-title" className="card scroll-mt-24 p-6">
            <h2 id="weak-title" className="text-[1.0625rem] font-semibold">
              Weak spots
            </h2>
            <p className="mt-1 text-sm text-muted">Your lowest accuracy over the last 30 days (5 answers or more).</p>
            <div className="mt-5">
              {weak === null ? (
                <p className="text-sm text-muted">Not available yet.</p>
              ) : weak.length === 0 ? (
                <p className="text-sm text-muted">
                  Nothing stands out yet. Keep practising and your weakest patterns will show up here.
                </p>
              ) : (
                <WeakSpotList spots={weak} detailed />
              )}
            </div>
          </section>
        </div>
      )}
    </AppPage>
  );
}
