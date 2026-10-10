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

/** A progress ring for today's goal; `onAccent` draws it white, for the red panel. */
export function GoalRing({
  answered,
  goal,
  size = 64,
  onAccent = false,
}: {
  answered: number;
  goal: number;
  size?: number;
  onAccent?: boolean;
}) {
  const stroke = Math.max(6, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = goal > 0 ? Math.min(1, answered / goal) : 0;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${answered} of ${goal} questions today`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className={onAccent ? "stroke-white/25" : "stroke-chip"}
        />
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
          className={onAccent ? "stroke-white" : share >= 1 ? "stroke-ok" : "stroke-accent"}
        />
      </svg>
      <span aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-bold" style={{ fontSize: Math.round(size * 0.24) }}>
          {Math.min(answered, 999)}
        </span>
        <span className={`mt-0.5 text-[0.6875rem] ${onAccent ? "text-on-accent-soft" : "text-muted"}`}>of {goal}</span>
      </span>
    </span>
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
    <div className="card flex items-center gap-5 p-5">
      <GoalRing answered={status.answered} goal={status.goal} />
      <div>
        <p className="font-semibold">
          {met
            ? "Daily goal reached"
            : `${plural(status.goal - status.answered, "question", "questions")} to today’s goal`}
        </p>
        {status.streak ? <p className="text-sm text-muted">{streakText(status.streak)}</p> : null}
      </div>
    </div>
  );
}
