"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { GoalRing, useTodayStatus } from "@/components/today";
import { Choice, Field } from "@/components/ui";
import { GOAL_CHOICES, weakSpots, type WeakSpot } from "@/lib/progress";
import { lastDays, missLabel, safely, skillHref } from "@/lib/progressView";
import { randomSeed } from "@/lib/session";
import { saveSettings } from "@/lib/storage";

const NEW_PER_DAY = [5, 10, 15, 20] as const;
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Streak, today's goal, the last 28 days, weak spots and the daily settings (plans/phase-2.md §7–8). */
export function ProgressPage() {
  const status = useTodayStatus();
  const { hydrated, ready, progress, settings, now, streak } = status;

  const days = useMemo(() => (hydrated ? lastDays(progress.days, now, 28) : []), [hydrated, progress, now]);
  const weak = useMemo<WeakSpot[] | null>(
    () => (hydrated && ready ? safely(() => weakSpots(progress, now), null) : null),
    [hydrated, ready, progress, now],
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-16">
      <header className="mb-10">
        <Link href="/" className="text-sm uppercase tracking-[0.2em] text-accent">
          Ćwiczenia
        </Link>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Your progress</h1>
        <p className="mt-3 text-muted">Your streak, your daily goal and where you slip up most.</p>
      </header>

      {!hydrated ? (
        <p className="text-muted">Loading your progress…</p>
      ) : (
        <div className="space-y-9">
          {!ready ? (
            <p className="rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn">
              Your progress can’t be read on this device right now. Practice still works.
            </p>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-5 rounded-2xl border border-line bg-surface p-5">
              <GoalRing answered={status.answered} goal={status.goal} size={72} />
              <div>
                <p className="text-sm uppercase tracking-wide text-muted">Today</p>
                <p className="font-medium">
                  {status.answered >= status.goal
                    ? "Daily goal reached"
                    : `${status.answered} of ${status.goal} questions`}
                </p>
                <Link href="/today" className="text-sm text-accent underline underline-offset-4">
                  Today’s practice
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-5">
              <p className="text-sm uppercase tracking-wide text-muted">Streak</p>
              {streak ? (
                <>
                  <p className="mt-1 text-3xl font-semibold text-accent">
                    {streak.current} <span className="text-base font-normal text-muted">{streak.current === 1 ? "day" : "days"}</span>
                  </p>
                  <p className="text-sm text-muted">
                    Best {streak.best} · {streak.today ? "today counts" : "meet today’s goal to extend it"}
                  </p>
                  {streak.graceUsed ? (
                    <p className="mt-1 text-sm text-warn">A grace day is holding your streak: don’t miss today.</p>
                  ) : null}
                </>
              ) : (
                <p className="mt-1 text-muted">Not available yet.</p>
              )}
            </div>
          </section>

          <Field label="Last 4 weeks" hint="Questions answered each day; a full square means the goal was met.">
            <div className="grid max-w-sm grid-cols-7 gap-1.5">
              {WEEKDAYS.map((d, i) => (
                <span key={i} className="text-center text-xs text-muted">
                  {d}
                </span>
              ))}
              {/* pad so each column is a weekday (Monday first) */}
              {days.length > 0
                ? Array.from({ length: (new Date(`${days[0].day}T00:00`).getDay() + 6) % 7 }, (_, i) => (
                    <span key={`pad-${i}`} />
                  ))
                : null}
              {days.map(({ day, answered }, i) => {
                const met = answered >= status.goal;
                const today = i === days.length - 1 ? " ring-2 ring-foreground/40" : "";
                const tone = met ? "bg-accent" : answered > 0 ? "bg-accent-soft border border-accent/40" : "bg-line/60";
                return (
                  <span
                    key={day}
                    title={`${day}: ${answered} answered`}
                    aria-label={`${day}: ${answered} answered`}
                    className={`aspect-square rounded-md ${tone}${today}`}
                  />
                );
              })}
            </div>
          </Field>

          <Field label="Weak spots" hint="Your lowest accuracy over the last 30 days (5 answers or more).">
            {weak === null ? (
              <p className="text-sm text-muted">Not available yet.</p>
            ) : weak.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing stands out yet. Keep practising and your weakest patterns will show up here.
              </p>
            ) : (
              <ul className="space-y-3">
                {weak.map((spot) => (
                  <WeakSpotRow key={spot.skill} spot={spot} />
                ))}
              </ul>
            )}
          </Field>

          <Settings goal={settings.goal} newPerDay={settings.newPerDay} />
        </div>
      )}
    </main>
  );
}

function WeakSpotRow({ spot }: { spot: WeakSpot }) {
  // the seed is picked once per row so the link is stable across re-renders
  const [seed] = useState(randomSeed);
  const href = skillHref(spot.skill, seed);
  const percent = spot.total ? Math.round((spot.correct / spot.total) * 100) : 0;
  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{spot.label}</span>
        <span className="shrink-0 text-sm text-muted">
          {percent}% of {spot.total}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
      </div>
      {spot.misses.length > 0 ? (
        <p className="mt-2 text-sm text-muted">
          Most often: {spot.misses.slice(0, 3).map((m) => missLabel(m.kind)).join("; ")}
        </p>
      ) : null}
      {href ? (
        <Link href={href} className="mt-2 inline-block text-sm text-accent underline underline-offset-4">
          Practise this
        </Link>
      ) : null}
    </li>
  );
}

function Settings({ goal, newPerDay }: { goal: number; newPerDay: number }) {
  return (
    <>
      <Field label="Daily goal" hint="Questions to answer each day for it to count toward your streak.">
        <div className="flex flex-wrap gap-3">
          {GOAL_CHOICES.map((g) => (
            <Choice key={g} selected={goal === g} onClick={() => saveSettings({ goal: g, newPerDay })} className="w-20 text-center">
              <span className="font-medium">{g}</span>
            </Choice>
          ))}
        </div>
      </Field>
      <Field label="New words per day" hint="How many new cards today’s practice may introduce.">
        <div className="flex flex-wrap gap-3">
          {NEW_PER_DAY.map((n) => (
            <Choice key={n} selected={newPerDay === n} onClick={() => saveSettings({ goal, newPerDay: n })} className="w-20 text-center">
              <span className="font-medium">{n}</span>
            </Choice>
          ))}
        </div>
      </Field>
    </>
  );
}
