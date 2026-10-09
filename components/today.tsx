"use client";

import { useMemo, useSyncExternalStore } from "react";
import { dueCount, safely } from "@/lib/progressView";
import { streak as computeStreak, type Progress, type Settings, type Streak } from "@/lib/progress";
import { dayKey } from "@/lib/srs";
import { useHydrated, useProgress, useProgressReady, useSettings } from "@/lib/storage";

const MINUTE = 60_000;

function subscribeMinute(onChange: () => void): () => void {
  const id = window.setInterval(onChange, MINUTE);
  return () => window.clearInterval(id);
}

/** The time, to the minute (stable between renders); 0 on the server. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribeMinute,
    () => Math.floor(Date.now() / MINUTE) * MINUTE,
    () => 0,
  );
}

export type TodayStatus = {
  /** False on the server and before hydration: render the fallback. */
  hydrated: boolean;
  /** The progress logic works; when false only `answered` / `goal` from settings are trustworthy. */
  ready: boolean;
  now: number;
  progress: Progress;
  settings: Settings;
  answered: number;
  goal: number;
  /** Null while the streak cannot be computed. */
  streak: Streak | null;
  due: number;
};

/** Today's numbers for the home button, the /today results and /progress. */
export function useTodayStatus(): TodayStatus {
  const hydrated = useHydrated();
  const ready = useProgressReady();
  const progress = useProgress();
  const settings = useSettings();
  const now = useNow();
  return useMemo(() => {
    const today = hydrated ? progress.days[dayKey(now)] : undefined;
    return {
      hydrated,
      ready,
      now,
      progress,
      settings,
      answered: today?.answered ?? 0,
      goal: settings.goal,
      streak: hydrated && ready ? safely(() => computeStreak(progress, settings.goal, now), null) : null,
      due: hydrated ? dueCount(progress, now) : 0,
    };
  }, [hydrated, ready, progress, settings, now]);
}

/** A progress ring for today's goal. */
export function GoalRing({ answered, goal, size = 64 }: { answered: number; goal: number; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = goal > 0 ? Math.min(1, answered / goal) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${answered} of ${goal} questions today`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-line" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - share)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={share >= 1 ? "stroke-ok" : "stroke-accent"}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-foreground text-xs font-medium"
      >
        {Math.min(answered, 999)}/{goal}
      </text>
    </svg>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3-day streak" / "No streak yet", plus the grace-day note. */
export function streakText(s: Streak | null): string {
  if (!s) return "";
  if (s.current === 0) return "No streak yet";
  return `${s.current}-day streak${s.graceUsed ? " (grace day used)" : ""}`;
}

/** The goal and streak block shown when today's practice is finished. */
export function GoalStatus() {
  const status = useTodayStatus();
  if (!status.hydrated) return null;
  const met = status.answered >= status.goal;
  return (
    <div className="flex items-center gap-5 rounded-2xl border border-line bg-surface p-5">
      <GoalRing answered={status.answered} goal={status.goal} />
      <div>
        <p className="font-medium">
          {met
            ? "Daily goal reached"
            : `${plural(status.goal - status.answered, "question", "questions")} to today’s goal`}
        </p>
        {status.streak ? <p className="text-sm text-muted">{streakText(status.streak)}</p> : null}
      </div>
    </div>
  );
}
