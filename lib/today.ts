import type { Progress, Settings } from "./progress";
import type { DrillKind, Exercise, Level } from "./types";

/**
 * "Today's practice" (plans/phase-2.md §5–6): due reviews first, then new cards,
 * then filler. Pure: the same progress, time and seed give the same session.
 */
export type TodayPlan = {
  exercises: Exercise[];
  /** How many of them are reviews, new cards and filler. */
  due: number;
  fresh: number;
  extra: number;
  /** Nothing was due and the new-card budget is spent: this is extra practice. */
  extraOnly: boolean;
  /** The level cap new cards were drawn under. */
  level: Level;
};

export type TodayOptions = {
  settings: Settings;
  /** Restrict to these drills; all by default. Tests pass a fake registry through `sources`. */
  drills?: DrillKind[];
  answerMode?: "typing" | "choice";
};

export function buildToday(progress: Progress, now: number, seed: number, opts: TodayOptions): TodayPlan {
  void progress;
  void now;
  void seed;
  void opts;
  throw new Error("today.buildToday: not implemented yet (Phase 2 item D)");
}

/** The default seed for a day: a hash of its local date, so a reload rebuilds the same session. */
export function daySeed(day: string): number {
  let h = 2166136261;
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 1_000_000;
}
