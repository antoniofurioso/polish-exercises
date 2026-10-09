import type { Exercise, MissKind } from "./types";

/**
 * Why a wrong answer was wrong, as a `MissKind` for the answer log and the
 * weak-spots view (plans/phase-2.md §8). Returns undefined when there is no
 * diagnosis.
 *
 * TODO(phase 2): wire to `diagnoseMiss(input, ex)?.kind` from lib/diagnose.ts
 * and, for verb exercises, `diagnoseVerbMiss(input, ex)` from lib/verbs.ts,
 * once those land. Until then every miss is logged without a kind.
 */
export function missKindOf(input: string, exercise: Exercise): MissKind | undefined {
  void input;
  void exercise;
  return undefined;
}
