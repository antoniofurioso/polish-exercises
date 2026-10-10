"use client";

import Link from "next/link";
import { useMemo } from "react";
import { GoalRing, streakText, useTodayStatus } from "@/components/today";
import { safely } from "@/lib/progressView";
import { dayKey } from "@/lib/srs";
import { buildToday, daySeed } from "@/lib/today";

/**
 * The home page's "Today's practice" button. The server and the first client
 * render show a plain button; after hydration it adds the streak, today's goal
 * and the reviews due, or reads "Extra practice" when nothing is due and the
 * new-card budget is spent.
 */
export function TodayButton() {
  const status = useTodayStatus();
  const { hydrated, ready, progress, settings, now } = status;
  const day = hydrated ? dayKey(now) : "";

  const extraOnly = useMemo(() => {
    if (!hydrated || !ready) return false;
    return safely(() => buildToday(progress, now, daySeed(day), { settings }).extraOnly, false);
  }, [hydrated, ready, progress, settings, now, day]);

  const details: string[] = [];
  if (hydrated && ready) {
    if (!extraOnly) details.push(status.due > 0 ? `${status.due} due` : "New words waiting");
    const streak = streakText(status.streak);
    if (streak) details.push(streak);
  }

  return (
    <div className="mb-8 space-y-3">
      <Link
        href="/today"
        className="flex items-center gap-5 rounded-2xl bg-accent px-6 py-5 text-white transition-opacity hover:opacity-90"
      >
        <span className="flex-1">
          <span className="block text-xs uppercase tracking-[0.2em] opacity-80">
            {extraOnly ? "Dodatkowa praktyka" : "Dzisiaj"}
          </span>
          <span className="mt-1 block text-2xl font-semibold">
            {extraOnly ? "Extra practice" : "Today’s practice"}
          </span>
          <span className="mt-1 block text-sm opacity-90">
            {details.length > 0
              ? details.join(" · ")
              : extraOnly
                ? "You’re all caught up: drill your weakest spots."
                : "A short mixed session, picked for you."}
          </span>
        </span>
        {hydrated ? (
          <span className="shrink-0 rounded-full bg-surface p-1">
            <GoalRing answered={status.answered} goal={status.goal} size={60} />
          </span>
        ) : null}
      </Link>
      <div className="text-right">
        <Link href="/progress" className="text-sm text-accent underline underline-offset-4">
          Your progress →
        </Link>
      </div>
    </div>
  );
}
