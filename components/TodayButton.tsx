"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { GoalRing, useTodayStatus } from "@/components/today";
import { safely } from "@/lib/progressView";
import { dayKey } from "@/lib/srs";
import { buildToday, daySeed } from "@/lib/today";

/**
 * The home page's red "Today's practice" panel. The server and the first client
 * render show the plain panel; after hydration it adds today's goal ring, what
 * the session holds (reviews, new, extra), or reads "Extra practice" when
 * nothing is due and the new-card budget is spent.
 */
export function TodayButton() {
  const status = useTodayStatus();
  const { hydrated, ready, progress, settings, now } = status;
  const day = hydrated ? dayKey(now) : "";

  const plan = useMemo(() => {
    if (!hydrated || !ready) return null;
    return safely(() => buildToday(progress, now, daySeed(day), { settings }), null);
  }, [hydrated, ready, progress, settings, now, day]);
  const extraOnly = plan?.extraOnly ?? false;
  const left = Math.max(0, status.goal - status.answered);

  const parts: string[] = [];
  if (plan && !extraOnly) {
    if (plan.due) parts.push(`${plan.due} ${plan.due === 1 ? "review" : "reviews"}`);
    if (plan.fresh) parts.push(`${plan.fresh} new`);
    if (plan.extra) parts.push(`${plan.extra} extra`);
  }

  return (
    <section aria-labelledby="today-title" className="panel-accent flex flex-wrap items-center gap-6 p-6 sm:gap-8 sm:p-9">
      <svg aria-hidden="true" viewBox="0 0 200 200" className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 opacity-15">
        <circle cx="100" cy="100" r="90" fill="none" stroke="#fff" strokeWidth="2" />
        <circle cx="100" cy="100" r="60" fill="none" stroke="#fff" strokeWidth="2" />
      </svg>
      {hydrated ? <GoalRing answered={status.answered} goal={status.goal} size={104} onAccent /> : null}
      <div className="relative min-w-0 flex-[1_1_14rem]">
        <p lang="pl" className="text-xs font-semibold uppercase tracking-[0.14em] text-on-accent-soft">
          {extraOnly ? "Dodatkowa praktyka" : "Dzisiaj"}
        </p>
        <h2 id="today-title" className="mt-1 text-2xl font-bold tracking-tight">
          {extraOnly ? "Extra practice" : "Today’s practice"}
        </h2>
        <p className="mt-1.5 text-on-accent-soft">
          {!hydrated
            ? "A short mixed session, picked for you."
            : extraOnly
              ? "You’re all caught up: drill your weakest spots."
              : left > 0
                ? `${left} ${left === 1 ? "question" : "questions"} to today’s goal: reviews first, then new words.`
                : "Goal reached. Keep going if you like."}
        </p>
        {parts.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2 text-[0.8125rem] font-medium">
            {parts.map((p) => (
              <li key={p} className="rounded-full bg-white/15 px-3 py-1.5">
                {p}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Link href="/today" className="btn btn-inverse btn-lg relative">
        {hydrated && status.answered > 0 ? "Continue" : "Start"}
        <ArrowRight size={20} aria-hidden="true" />
      </Link>
    </section>
  );
}
