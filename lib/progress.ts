import type { Verdict } from "./grade";
import type { CardState } from "./srs";
import type { Case, DrillKind, MissKind, Stats } from "./types";

/**
 * Learner progress, schema v2 (plans/phase-2.md §4). Pure functions only: the
 * localStorage wiring lives in lib/storage.ts. The answer log is the source of
 * truth; `Progress` is a cache that `replay` rebuilds from it.
 */

/** One answer, as stored in the log. Everything in it is device-independent. */
export type AnswerEvent = {
  /** ms since epoch. */
  t: number;
  /** Local calendar day of `t` on the device that answered ("2026-10-09"). */
  day: string;
  card: string;
  skill: string;
  verdict: Verdict;
  miss?: MissKind;
  /** The drill × case the configurator percentages count it under. */
  drill: DrillKind;
  case: Case;
};

export type DayCount = { answered: number; correct: number };

export type SkillStat = {
  correct: number;
  total: number;
  /** Miss kinds seen on this skill, counted. */
  misses: Partial<Record<MissKind, number>>;
  /** Per local day, for the "last 30 days" weak-spots window. */
  days: Record<string, DayCount>;
};

export type Progress = {
  v: 2;
  cards: Record<string, CardState>;
  skills: Record<string, SkillStat>;
  days: Record<string, DayCount>;
  /** The configurator percentages: drill → case → counts. */
  cases: Partial<Record<DrillKind, Stats>>;
  /** Events folded in by compaction, oldest first; replay starts from here. */
  base?: Omit<Progress, "base">;
  /** v1 per-case stats have been copied in. */
  migrated?: boolean;
};

export type Settings = {
  /** Questions per day (10 / 20 / 40). */
  goal: number;
  newPerDay: number;
};

export const DEFAULT_SETTINGS: Settings = { goal: 20, newPerDay: 10 };
export const GOAL_CHOICES = [10, 20, 40] as const;

export const EMPTY_PROGRESS: Progress = { v: 2, cards: {}, skills: {}, days: {}, cases: {} };

const todo = (name: string): never => {
  throw new Error(`progress.${name}: not implemented yet (Phase 2 item D)`);
};

/** Folds one answer into the cache. Pure: returns a new object. */
export function apply(progress: Progress, event: AnswerEvent): Progress {
  void progress;
  void event;
  return todo("apply");
}

/** Rebuilds the cache from scratch (or from `base`) by applying every event in order. */
export function replay(events: AnswerEvent[], base?: Progress["base"]): Progress {
  void events;
  void base;
  return todo("replay");
}

/** Copies v1 per-case stats (polish.stats.<kind>.v1) into the v2 per-drill × case counts. */
export function migrateV1(progress: Progress, v1: Partial<Record<DrillKind, Stats>>): Progress {
  void progress;
  void v1;
  return todo("migrateV1");
}

/** Keeps the newest `keep` events and folds the rest into `base`. */
export function compact(
  progress: Progress,
  events: AnswerEvent[],
  keep: number,
): { progress: Progress; events: AnswerEvent[] } {
  void progress;
  void events;
  void keep;
  return todo("compact");
}

export type Streak = {
  /** Goal days in the current streak, today included if its goal is met. */
  current: number;
  best: number;
  /** Today's goal is met. */
  today: boolean;
  /** A grace day is holding the streak together right now. */
  graceUsed: boolean;
};

/** Streak by local day with one grace day per 7 days (plans/phase-2.md §7). */
export function streak(progress: Progress, goal: number, now: number): Streak {
  void progress;
  void goal;
  void now;
  return todo("streak");
}

export type WeakSpot = {
  skill: string;
  drill: DrillKind;
  /** From the drill's CardSource.skillLabel. */
  label: string;
  correct: number;
  total: number;
  /** Most frequent miss kinds on this skill, most common first. */
  misses: { kind: MissKind; count: number }[];
};

/** Skills with ≥ 5 answers in the last 30 days, lowest accuracy first. */
export function weakSpots(progress: Progress, now: number, limit = 5): WeakSpot[] {
  void progress;
  void now;
  void limit;
  return todo("weakSpots");
}
