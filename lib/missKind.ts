import { diagnoseMiss } from "./diagnose";
import type { Exercise, MissKind } from "./types";
import { diagnoseVerbMiss } from "./verbs";

/**
 * Why a wrong answer was wrong, as a `MissKind` for the answer log and the
 * weak-spots view (plans/phase-2.md §8): verbs ask `diagnoseVerbMiss` first
 * (aspect, person, tense); everything else, and verb misses it can't place,
 * go through `diagnoseMiss`. Undefined when there is no diagnosis.
 */
export function missKindOf(input: string, exercise: Exercise): MissKind | undefined {
  if (exercise.card?.startsWith("verbs:")) {
    const verb = diagnoseVerbMiss(input, exercise);
    if (verb) return verb;
  }
  return diagnoseMiss(input, exercise)?.kind;
}
