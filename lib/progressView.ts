import { drillOfCard } from "./cards";
import type { DayCount, Progress } from "./progress";
import { sessionParams } from "./session";
import { dayKey, startOfDay } from "./srs";
import { CASES, DRILL_KINDS, NUMBER_CASES, NUMBER_DRILLS, PRONOUN_CASES, TENSES } from "./types";
import type { Case, Config, DrillKind, GramNumber, MissKind, NumberDrill, Tense } from "./types";

/**
 * Pure helpers behind the home button, /today and /progress: plain-English
 * miss kinds, a configured session for a weak skill, and the day grid.
 */

/** What a `MissKind` means, for the weak-spots list. */
export const MISS_LABELS: Record<MissKind, string> = {
  empty: "left blank",
  case: "the right word in the wrong case",
  number: "singular and plural mixed up",
  caseNumber: "wrong case and number",
  accAnimacy: "accusative of an animate masculine",
  gender: "wrong gender ending on the adjective",
  ending: "the right stem with the wrong ending",
  typo: "a one-letter slip",
  wordCount: "too many or too few words",
  aspect: "the other aspect of the verb",
  person: "the wrong person or number of the verb",
  tense: "the right verb in the wrong tense",
  pastGender: "past tense with the wrong gender ending",
  government: "the noun's form after a number (pięć kotów, dwa koty)",
  numeralForm: "the number's own form (dwa / dwie / dwaj, dwóch…)",
  other: "another mistake",
};

export const missLabel = (kind: MissKind): string => MISS_LABELS[kind] ?? MISS_LABELS.other;

const includes = <T extends string>(list: readonly T[], value: string): value is T =>
  (list as readonly string[]).includes(value);

const numberOf = (value: string): GramNumber[] | null =>
  value === "sg" || value === "pl" ? [value] : null;

/**
 * A configured session that drills one skill id, or null for a skill no
 * configurator can narrow to:
 *   cases:ins|pl → the cases drill, instrumental plural;
 *   verbs:past|3pl → the verbs drill, past tense, plural persons;
 *   numbers:count|… → the numbers drill, count sub-drill only.
 */
export function skillConfig(skill: string, count = 20): Config | null {
  const colon = skill.indexOf(":");
  if (colon < 0) return null;
  const drill = skill.slice(0, colon);
  const [first = "", second = ""] = skill.slice(colon + 1).split("|");
  const base = { mode: "nouns" as const, count };

  switch (drill) {
    case "cases": {
      const numbers = numberOf(second);
      if (!includes<Case>(CASES, first) || !numbers) return null;
      return { kind: "cases", cases: [first], numbers, ...base };
    }
    case "pronouns":
    case "possessives": {
      const numbers = numberOf(second);
      if (!includes<Case>(PRONOUN_CASES, first) || !numbers) return null;
      return { kind: drill, cases: [first], numbers, ...base };
    }
    case "numbers": {
      if (!includes<NumberDrill>(NUMBER_DRILLS, first)) return null;
      return { kind: "numbers", cases: [...NUMBER_CASES], numbers: ["sg"], drills: [first], ...base };
    }
    case "verbs": {
      if (!includes<Tense>(TENSES, first)) return null;
      const numbers: GramNumber[] = second.endsWith("sg") ? ["sg"] : second.endsWith("pl") ? ["pl"] : ["sg", "pl"];
      return { kind: "verbs", cases: ["nom"], numbers, tenses: [first], ...base };
    }
    default:
      return null;
  }
}

/** The /practice link for a skill, or null when it has no configured session. */
export function skillHref(skill: string, seed: number, count = 20): string | null {
  const config = skillConfig(skill, count);
  return config ? `/practice?${sessionParams(config, seed)}` : null;
}

/** The last `n` local days, oldest first, with what was answered on each. */
export function lastDays(
  days: Record<string, DayCount>,
  now: number,
  n = 28,
): { day: string; answered: number; correct: number }[] {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = dayKey(startOfDay(now, -i));
    const count = days[day];
    out.push({ day, answered: count?.answered ?? 0, correct: count?.correct ?? 0 });
  }
  return out;
}

/** Cards due at `now`: reviews waiting, new cards not counted. */
export function dueCount(progress: Progress, now: number): number {
  let n = 0;
  for (const card of Object.values(progress.cards)) if (card.due <= now) n++;
  return n;
}

/** Calls `fn`, or returns `fallback` when it throws (the progress logic must never break a page). */
export function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

// ---- dashboard and profile numbers --------------------------------------------

/** Right and answered over the last `n` local days, today included. */
export function recentAccuracy(
  days: Record<string, DayCount>,
  now: number,
  n = 7,
): { answered: number; correct: number } {
  let answered = 0;
  let correct = 0;
  for (const day of lastDays(days, now, n)) {
    answered += day.answered;
    correct += day.correct;
  }
  return { answered, correct };
}

/** Every answer on record (compacted ones included, since days survive compaction). */
export function totalAnswered(progress: Progress): number {
  let n = 0;
  for (const count of Object.values(progress.days)) n += count.answered;
  return n;
}

/** Cards practised so far, per drill. */
export function cardsByDrill(progress: Progress): Record<DrillKind, number> {
  const out = Object.fromEntries(DRILL_KINDS.map((k) => [k, 0])) as Record<DrillKind, number>;
  for (const id of Object.keys(progress.cards)) {
    const drill = drillOfCard(id, DRILL_KINDS);
    if (drill) out[drill] += 1;
  }
  return out;
}

/** The cases with at least one cases-drill card answered right ("cases:kot|gen|sg"). */
export function casesPractised(progress: Progress): Set<Case> {
  const out = new Set<Case>();
  for (const [id, card] of Object.entries(progress.cards)) {
    if (!id.startsWith("cases:") || card.right === 0) continue;
    const kase = id.split("|")[1];
    if (includes<Case>(CASES, kase)) out.add(kase);
  }
  return out;
}

export type Milestone = { id: string; title: string; detail: string; reached: boolean };

/** The profile's milestones, from the progress and the best streak. */
export function milestones(progress: Progress, bestStreak: number): Milestone[] {
  const cards = Object.keys(progress.cards).length;
  const cases = casesPractised(progress).size;
  return [
    { id: "first", title: "First answer", detail: "Answer one question", reached: totalAnswered(progress) > 0 },
    { id: "week", title: "First week", detail: "A 7-day streak", reached: bestStreak >= 7 },
    { id: "hundred", title: "Hundred club", detail: "Practise 100 cards", reached: cards >= 100 },
    {
      id: "cases",
      title: "All seven cases",
      detail: `Get a card right in every case (${cases} of ${CASES.length})`,
      reached: cases === CASES.length,
    },
    { id: "month", title: "A month of Polish", detail: "A 30-day streak", reached: bestStreak >= 30 },
  ];
}
