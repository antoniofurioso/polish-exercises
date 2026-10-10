import { drillOfCard } from "./cards";
import type { CardSource } from "./cards";
import { DRILLS } from "./drills";
import type { Verdict } from "./grade";
import { addDays, dayKey, dayNumber, schedule } from "./srs";
import type { CardState } from "./srs";
import { DRILL_KINDS, LEVELS, MISS_KINDS } from "./types";
import type { Case, CaseStat, DrillKind, Level, MissKind, Stats } from "./types";

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

type Snapshot = Omit<Progress, "base">;

/** A copy whose top-level records can be written without touching `p`'s. */
function own(p: Snapshot): Snapshot {
  return { ...p, cards: { ...p.cards }, skills: { ...p.skills }, days: { ...p.days }, cases: { ...p.cases } };
}

const bump = (count: DayCount | undefined, pass: boolean): DayCount => ({
  answered: (count?.answered ?? 0) + 1,
  correct: (count?.correct ?? 0) + (pass ? 1 : 0),
});

/**
 * Folds `event` into `p`. Writes only `p`'s top-level records, and replaces the
 * values in them rather than mutating them, so it is pure on an `own()` copy.
 */
function fold(p: Snapshot, event: AnswerEvent): void {
  // a diacritics-only miss counts as right everywhere but the configurator percentages
  const pass = event.verdict !== "wrong";
  p.cards[event.card] = schedule(p.cards[event.card], event.verdict, event.t);

  const skill = p.skills[event.skill];
  p.skills[event.skill] = {
    correct: (skill?.correct ?? 0) + (pass ? 1 : 0),
    total: (skill?.total ?? 0) + 1,
    misses: event.miss
      ? { ...skill?.misses, [event.miss]: (skill?.misses[event.miss] ?? 0) + 1 }
      : (skill?.misses ?? {}),
    days: { ...skill?.days, [event.day]: bump(skill?.days[event.day], pass) },
  };

  p.days[event.day] = bump(p.days[event.day], pass);

  // the configurator percentages keep their v1 meaning: only a fully correct answer counts
  const stats = p.cases[event.drill];
  const stat = stats?.[event.case];
  p.cases[event.drill] = {
    ...stats,
    [event.case]: {
      correct: (stat?.correct ?? 0) + (event.verdict === "correct" ? 1 : 0),
      total: (stat?.total ?? 0) + 1,
    },
  };
}

/** Folds one answer into the cache. Pure: returns a new object. */
export function apply(progress: Progress, event: AnswerEvent): Progress {
  const next = own(progress);
  fold(next, event);
  return next;
}

/**
 * Rebuilds the cache from scratch (or from `base`) by applying every event in order.
 * The result equals folding the same events with `apply` onto the progress `base`
 * came from, and it keeps `base` so the next compaction can extend it.
 */
export function replay(events: AnswerEvent[], base?: Progress["base"]): Progress {
  const next = own(base ?? EMPTY_PROGRESS);
  for (const event of events) fold(next, event);
  return base ? { ...next, base } : next;
}

/** `cases` with `extra`'s per-case counts added. */
function addCases(cases: Progress["cases"], extra: Partial<Record<DrillKind, Stats>>): Progress["cases"] {
  const out = { ...cases };
  for (const drill of DRILL_KINDS) {
    const add = extra[drill];
    if (!add) continue;
    const stats: Stats = { ...out[drill] };
    for (const [kase, stat] of Object.entries(add) as [Case, CaseStat | undefined][]) {
      if (!stat) continue;
      const have = stats[kase];
      stats[kase] = { correct: (have?.correct ?? 0) + stat.correct, total: (have?.total ?? 0) + stat.total };
    }
    out[drill] = stats;
  }
  return out;
}

/**
 * Copies v1 per-case stats (polish.stats.<kind>.v1) into the v2 per-drill × case counts,
 * once: `migrated` is set and a second call returns `progress` unchanged. The counts go
 * into `base` too, so `replay(log, progress.base)` keeps them.
 */
export function migrateV1(progress: Progress, v1: Partial<Record<DrillKind, Stats>>): Progress {
  if (progress.migrated) return progress;
  const base = progress.base ?? EMPTY_PROGRESS;
  return {
    ...progress,
    cases: addCases(progress.cases, v1),
    migrated: true,
    base: { ...base, cases: addCases(base.cases, v1), migrated: true },
  };
}

/**
 * Keeps the newest `keep` events and folds the rest into `base`. The cache itself is
 * unchanged, and `replay(result.events, result.progress.base)` rebuilds it.
 */
export function compact(
  progress: Progress,
  events: AnswerEvent[],
  keep: number,
): { progress: Progress; events: AnswerEvent[] } {
  const cut = Math.max(0, events.length - Math.max(0, keep));
  if (cut === 0) return { progress, events };
  const base = own(progress.base ?? EMPTY_PROGRESS);
  for (const event of events.slice(0, cut)) fold(base, event);
  return { progress: { ...progress, base }, events: events.slice(cut) };
}

/** The log length at which storage should compact (plans/phase-2.md §4). */
export const COMPACT_AT = 20_000;

/** Today's answered / correct counts. */
export function todayCount(progress: Progress, now: number): DayCount {
  return progress.days[dayKey(now)] ?? { answered: 0, correct: 0 };
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The ids of the cards due at `now`, most overdue first. */
export function dueCards(progress: Progress, now: number): string[] {
  return Object.entries(progress.cards)
    .filter(([, card]) => card.due <= now)
    .sort(([a, x], [b, y]) => x.due - y.due || byId(a, b))
    .map(([id]) => id);
}

/** How many cards are due at `now`. */
export function cardsDue(progress: Progress, now: number): number {
  let n = 0;
  for (const card of Object.values(progress.cards)) if (card.due <= now) n++;
  return n;
}

/** Cards first answered on `now`'s local day: they used up that much of the new-card budget. */
export function introducedToday(progress: Progress, now: number): number {
  const today = dayKey(now);
  let n = 0;
  for (const card of Object.values(progress.cards)) if (dayKey(card.first) === today) n++;
  return n;
}

/** Card sources by drill; tests pass fakes, the app uses `registrySources()`. */
export type Sources = Partial<Record<DrillKind, CardSource>>;

/** Every drill's card source from the registry (read at call time: the registry loads the lexicon). */
export function registrySources(): Sources {
  return Object.fromEntries(DRILL_KINDS.map((kind) => [kind, DRILLS[kind].cards]));
}

/** Share of a level's cards that must be seen, and the accuracy on them, to open the next level. */
export const LEVEL_SEEN = 0.8;
export const LEVEL_ACCURACY = 0.7;

/**
 * The highest level new cards are drawn from (plans/phase-2.md §5): A1 to start; the
 * next level opens once 80% of the current level's cards were seen, with ≥ 70% of the
 * answers on them right. A level without cards is passed through; no cards at all → A1.
 */
export function levelCap(progress: Progress, sources: Sources = registrySources()): Level {
  const byLevel = new Map<Level, string[]>();
  for (const source of Object.values(sources)) {
    for (const info of source?.all() ?? []) {
      const ids = byLevel.get(info.level) ?? [];
      ids.push(info.id);
      byLevel.set(info.level, ids);
    }
  }
  if (byLevel.size === 0) return LEVELS[0];
  for (const level of LEVELS) {
    const ids = byLevel.get(level) ?? [];
    if (ids.length === 0) continue;
    let seen = 0;
    let answers = 0;
    let right = 0;
    for (const id of ids) {
      const card = progress.cards[id];
      if (!card || card.seen === 0) continue;
      seen++;
      answers += card.seen;
      right += card.right;
    }
    if (seen < LEVEL_SEEN * ids.length || right < LEVEL_ACCURACY * answers) return level;
  }
  return LEVELS[LEVELS.length - 1];
}

export type Streak = {
  /** Goal days in the current streak, today included if its goal is met. */
  current: number;
  best: number;
  /** Today's goal is met. */
  today: boolean;
  /** A grace day is holding the streak together right now: one was used in the last 7 days. */
  graceUsed: boolean;
  /** The latest grace day inside the current streak, or null. */
  graceDay: string | null;
};

/** Grace days are at least this many days apart: at most one in any 7 days. */
export const GRACE_GAP = 7;

/**
 * Walks back from day number `from` while the streak holds: a goal day adds to it, a
 * single missed day between two goal days is a grace day (at most one per 7 days).
 * `pending`: a goal day may still follow `from` (today, in progress), so `from` itself
 * may be a grace day.
 */
function walkBack(
  met: (n: number) => boolean,
  from: number,
  stop: number,
  pending: boolean,
): { count: number; graces: number[] } {
  let count = 0;
  const graces: number[] = [];
  for (let n = from; n >= stop; n--) {
    if (met(n)) {
      count++;
      continue;
    }
    const last = graces[graces.length - 1];
    if ((count > 0 || pending) && met(n - 1) && (last === undefined || last - n >= GRACE_GAP)) {
      graces.push(n);
      continue;
    }
    break;
  }
  return { count, graces };
}

/**
 * Streak by local day with one grace day per 7 days (plans/phase-2.md §7). A day counts
 * when `answered ≥ goal`. Today never breaks the streak while it is in progress.
 */
export function streak(progress: Progress, goal: number, now: number): Streak {
  const todayKey = dayKey(now);
  const today = dayNumber(todayKey);
  const metDays = new Set<number>();
  for (const [day, count] of Object.entries(progress.days)) {
    if (count.answered >= goal) metDays.add(dayNumber(day));
  }
  const met = (n: number) => metDays.has(n);
  let first = today;
  for (const n of metDays) first = Math.min(first, n);

  const todayMet = met(today);
  const { count: current, graces } = walkBack(met, todayMet ? today : today - 1, first, !todayMet);
  const latestGrace = graces.length ? graces[0] : null;

  let best = current;
  for (const n of metDays) {
    if (n > today || met(n + 1)) continue;
    best = Math.max(best, walkBack(met, n, first, false).count);
  }

  return {
    current,
    best,
    today: todayMet,
    graceUsed: latestGrace !== null && today - latestGrace < GRACE_GAP,
    graceDay: latestGrace === null ? null : addDays(todayKey, latestGrace - today),
  };
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

export type WeakSpotOptions = {
  /** Names a skill; the drill's CardSource.skillLabel by default. */
  label?: (skill: string, drill: DrillKind) => string;
  /** Answers a skill needs inside the window to count (5). */
  minAnswers?: number;
  /** The window in local days, today included (30). */
  days?: number;
  /** How many miss kinds to list per skill (3). */
  misses?: number;
};

export type SkillScore = { skill: string; drill: DrillKind; correct: number; total: number };

export const WEAK_MIN_ANSWERS = 5;
export const WEAK_WINDOW_DAYS = 30;

/**
 * Skills with at least `minAnswers` answers in the last `days` local days (today
 * included), lowest accuracy first; ties go to the skill with more answers, then by id.
 */
export function weakSkills(
  progress: Progress,
  now: number,
  minAnswers = WEAK_MIN_ANSWERS,
  days = WEAK_WINDOW_DAYS,
): SkillScore[] {
  const today = dayNumber(dayKey(now));
  const scores: SkillScore[] = [];
  for (const [skill, stat] of Object.entries(progress.skills)) {
    const drill = drillOfCard(skill, DRILL_KINDS);
    if (!drill) continue;
    let correct = 0;
    let total = 0;
    for (const [day, count] of Object.entries(stat.days)) {
      const age = today - dayNumber(day);
      if (age < 0 || age >= days) continue;
      correct += count.correct;
      total += count.answered;
    }
    if (total >= minAnswers) scores.push({ skill, drill, correct, total });
  }
  return scores.sort(
    (a, b) => a.correct / a.total - b.correct / b.total || b.total - a.total || byId(a.skill, b.skill),
  );
}

/**
 * Skills with ≥ 5 answers in the last 30 days, lowest accuracy first, each with its
 * most frequent miss kinds (tallied over the skill's whole history).
 */
export function weakSpots(progress: Progress, now: number, limit = 5, opts: WeakSpotOptions = {}): WeakSpot[] {
  const label = opts.label ?? ((skill: string, drill: DrillKind) => DRILLS[drill].cards.skillLabel(skill));
  return weakSkills(progress, now, opts.minAnswers, opts.days)
    .slice(0, limit)
    .map(({ skill, drill, correct, total }) => ({
      skill,
      drill,
      label: label(skill, drill),
      correct,
      total,
      misses: MISS_KINDS.map((kind) => ({ kind, count: progress.skills[skill].misses[kind] ?? 0 }))
        .filter((m) => m.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, opts.misses ?? 3),
    }));
}
