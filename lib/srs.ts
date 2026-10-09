import type { Verdict } from "./grade";

/**
 * SM-2 with three grades (correct / diacritics / wrong); see plans/phase-2.md §3.
 * Pure: no storage, no clock. Times are ms since epoch, intervals whole days.
 */
export type CardState = {
  /** When the card is next due. */
  due: number;
  /** Days until the next review after the last pass; 0 while relearning. */
  interval: number;
  ease: number;
  /** Passes in a row. */
  reps: number;
  lapses: number;
  /** Last answer time. */
  last: number;
  /** First answer time: the card was "introduced" on this local day (new-card budget). */
  first: number;
  /** Answers ever, and how many were right (diacritics-only misses count as right). */
  seen: number;
  right: number;
};

export const INITIAL_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
/** A wrong card comes back this soon. */
export const RELEARN_MS = 10 * 60 * 1000;

const clampEase = (ease: number) => Math.min(MAX_EASE, Math.max(MIN_EASE, Math.round(ease * 100) / 100));

/** The state after answering `card` (undefined for a new card) with `verdict` at time `t`. */
export function schedule(card: CardState | undefined, verdict: Verdict, t: number): CardState {
  const prev: CardState = card ?? {
    due: t,
    interval: 0,
    ease: INITIAL_EASE,
    reps: 0,
    lapses: 0,
    last: t,
    first: t,
    seen: 0,
    right: 0,
  };
  const seen = prev.seen + 1;
  const first = prev.first;
  if (verdict === "wrong") {
    return {
      due: t + RELEARN_MS,
      interval: 0,
      ease: clampEase(prev.ease - 0.2),
      reps: 0,
      lapses: prev.lapses + 1,
      last: t,
      first,
      seen,
      right: prev.right,
    };
  }
  const reps = prev.reps + 1;
  let interval: number;
  let ease: number;
  if (verdict === "correct") {
    // 1 → 3 → interval × ease; never shorter than one day more than last time, so a
    // card stuck at 1 day (after diacritics passes) still moves on
    interval =
      reps === 1 ? 1 : reps === 2 ? 3 : Math.max(prev.interval + 1, Math.round(prev.interval * prev.ease));
    ease = clampEase(prev.ease + 0.05);
  } else {
    interval = Math.max(1, Math.round(prev.interval * 1.2));
    ease = clampEase(prev.ease - 0.05);
  }
  return {
    due: startOfDay(t, interval),
    interval,
    ease,
    reps,
    lapses: prev.lapses,
    last: t,
    first,
    seen,
    right: prev.right + 1,
  };
}

/** The card is due at `now`. */
export const isDue = (card: CardState, now: number): boolean => card.due <= now;

/** Midnight at the start of `t`'s local day, `days` days later. */
export function startOfDay(t: number, days = 0): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** "2026-10-09": the local calendar day `t` falls on. */
export function dayKey(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A day key as a plain day number (days since 1970-01-01), for calendar arithmetic free of DST. */
export function dayNumber(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** The day key `n` days after `day` (negative for before). */
export function addDays(day: string, n: number): string {
  const t = new Date((dayNumber(day) + n) * 86_400_000);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
