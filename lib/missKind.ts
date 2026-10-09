import { diagnoseMiss } from "./diagnose";
import { diagnoseNumberMiss } from "./diagnoseNumbers";
import type { Exercise, MissKind } from "./types";
import { diagnoseVerbMiss } from "./verbs";

/**
 * Why a wrong answer was wrong, as a `MissKind` for the answer log and the
 * weak-spots view (plans/phase-2.md §8). Verbs ask `diagnoseVerbMiss` first
 * (aspect, pastGender, person, tense), numbers `diagnoseNumberMiss`
 * (government, numeralForm, typo, ending, wordCount); everything else, and the
 * misses those can't place, go through `diagnoseMiss`. Undefined when there is
 * no diagnosis.
 */
export function missKindOf(input: string, exercise: Exercise): MissKind | undefined {
  const card = exercise.card ?? "";
  const own = card.startsWith("verbs:")
    ? diagnoseVerbMiss(input, exercise)
    : card.startsWith("numbers:")
      ? diagnoseNumberMiss(input, exercise)
      : null;
  return own ?? diagnoseMiss(input, exercise)?.kind;
}
