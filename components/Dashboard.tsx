"use client";

import { ChevronRight, Clock, Flame, Layers, Target } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { DrillIcon } from "@/components/DrillIcon";
import { ActivityGrid, StatCard, WeakSpotList } from "@/components/progress";
import { TodayButton } from "@/components/TodayButton";
import { streakText, useTodayStatus } from "@/components/today";
import { DRILLS } from "@/lib/drills";
import { levelCap, weakSpots } from "@/lib/progress";
import { lastDays, recentAccuracy, safely } from "@/lib/progressView";
import { useProfile } from "@/lib/storage";
import { EXERCISE_KINDS } from "@/lib/types";

const DATE = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** The app's home (/learn): greeting, today's practice, the numbers, activity, weak spots and every drill. */
export function Dashboard() {
  const status = useTodayStatus();
  const { hydrated, ready, progress, now, streak } = status;
  const profile = useProfile();

  const days = useMemo(() => (hydrated ? lastDays(progress.days, now, 28) : []), [hydrated, progress, now]);
  const weak = useMemo(
    () => (hydrated && ready ? safely(() => weakSpots(progress, now, 3), []) : []),
    [hydrated, ready, progress, now],
  );
  const level = useMemo(() => (hydrated && ready ? safely(() => levelCap(progress), null) : null), [hydrated, ready, progress]);
  const week = hydrated ? recentAccuracy(progress.days, now, 7) : { answered: 0, correct: 0 };
  const weekPercent = week.answered ? Math.round((week.correct / week.answered) * 100) : null;
  const cards = Object.keys(progress.cards).length;
  const show = (value: string | number) => (hydrated ? value : "–");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-8 sm:py-10 lg:px-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{hydrated ? DATE.format(now) : " "}</p>
          <h1 className="page-title mt-1">
            <span lang="pl">Dzień dobry</span>
            {profile.name ? `, ${profile.name}` : ""}
          </h1>
        </div>
        {streak && streak.current > 0 ? (
          <span className="chip bg-surface py-2.5 font-semibold text-foreground shadow-chip">
            <Flame size={18} className="text-accent" aria-hidden="true" />
            {streakText(streak)}
          </span>
        ) : null}
      </header>

      {hydrated && !ready ? (
        <p className="mt-6 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn">
          Your progress can’t be read on this device right now. Practice still works.
        </p>
      ) : null}

      <div className="mt-7">
        <TodayButton />
      </div>

      <section aria-label="Your numbers" className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Streak"
          icon={<Flame size={20} aria-hidden="true" />}
          value={show(streak?.current ?? 0)}
          unit={streak?.current === 1 ? "day" : "days"}
          detail={streak ? `Best: ${streak.best}` : undefined}
        />
        <StatCard
          label="Due now"
          icon={<Clock size={20} aria-hidden="true" />}
          value={show(status.due)}
          detail="Reviews waiting"
        />
        <StatCard
          label="Cards practised"
          icon={<Layers size={20} aria-hidden="true" />}
          value={show(cards)}
          detail={level ? `New cards up to ${level}` : undefined}
        />
        <StatCard
          label="Right, last 7 days"
          icon={<Target size={20} aria-hidden="true" />}
          value={show(weekPercent === null ? "–" : `${weekPercent}%`)}
        >
          <div className="meter mt-3" aria-hidden="true">
            <span style={{ width: `${weekPercent ?? 0}%` }} />
          </div>
        </StatCard>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section aria-labelledby="days-title" className="card p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="days-title" className="text-[1.0625rem] font-semibold">
              The last 28 days
            </h2>
            <Link href="/progress" className="link text-[0.8125rem]">
              Your progress
            </Link>
          </div>
          <div className="mt-5 max-w-xs">{hydrated ? <ActivityGrid days={days} goal={status.goal} /> : null}</div>
        </section>
        <section aria-labelledby="weak-title" className="card p-6">
          <div className="flex items-baseline justify-between">
            <h2 id="weak-title" className="text-[1.0625rem] font-semibold">
              Weak spots
            </h2>
            <Link href="/progress#weak" className="link text-[0.8125rem]">
              See all
            </Link>
          </div>
          <div className="mt-5">
            {weak.length > 0 ? (
              <WeakSpotList spots={weak} />
            ) : (
              <p className="text-sm text-muted">
                Nothing stands out yet. After a few sessions, the patterns you miss most show up here.
              </p>
            )}
          </div>
        </section>
      </div>

      <section aria-labelledby="drills-title" className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="drills-title" className="text-xl font-semibold">
            Practise a drill
          </h2>
          <p className="text-[0.8125rem] text-muted">Set up your own session</p>
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EXERCISE_KINDS.map((kind) => {
            const drill = DRILLS[kind];
            return (
              <li key={kind}>
                <Link href={drill.route} className="card card-link flex items-center gap-3.5 p-4">
                  <span className="tile tile-sm">
                    <DrillIcon kind={kind} size={20} />
                  </span>
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <span className="block font-semibold">{drill.title}</span>
                    <span lang="pl" className="block truncate text-[0.8125rem] text-muted">
                      {drill.pl}
                    </span>
                  </span>
                  <ChevronRight size={20} className="text-muted" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
