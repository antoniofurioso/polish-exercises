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
  /** Answers ever, and how many were right (diacritics-only misses count as right). */
  seen: number;
  right: number;
};

export const INITIAL_EASE = 2.5;

/** The state after answering `card` (undefined for a new card) with `verdict` at time `t`. */
export function schedule(card: CardState | undefined, verdict: Verdict, t: number): CardState {
  void card;
  void verdict;
  void t;
  throw new Error("srs.schedule: not implemented yet (Phase 2 item D)");
}

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
