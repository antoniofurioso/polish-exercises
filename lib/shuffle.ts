import { buildSession, makeRng, shuffle } from "./generate";
import { buildNumberSession } from "./numbers";
import { buildPossessiveSession } from "./possessives";
import { buildPronounSession } from "./pronouns";
import { buildVerbSession } from "./verbs";
import { CASES, DRILL_KINDS, NUMBER_CASES, POSSESSIVE_CASES, PRONOUN_CASES, TENSES } from "./types";
import type { Config, DrillKind, Exercise } from "./types";

/** The broad settings each drill runs with when it is mixed into a shuffle. */
const MIX_CONFIGS: Record<DrillKind, Omit<Config, "count" | "answerMode">> = {
  cases: { kind: "cases", cases: [...CASES], numbers: ["sg", "pl"], mode: "both" },
  pronouns: { kind: "pronouns", cases: [...PRONOUN_CASES], numbers: ["sg", "pl"], mode: "nouns" },
  possessives: {
    kind: "possessives",
    cases: [...POSSESSIVE_CASES],
    numbers: ["sg", "pl"],
    mode: "nouns",
  },
  numbers: { kind: "numbers", cases: [...NUMBER_CASES], numbers: ["sg"], mode: "nouns", max: 100 },
  verbs: { kind: "verbs", tenses: [...TENSES], cases: ["nom"], numbers: ["sg", "pl"], mode: "nouns" },
};

const BUILDERS: Record<DrillKind, (config: Config, seed: number) => Exercise[]> = {
  cases: buildSession,
  pronouns: buildPronounSession,
  possessives: buildPossessiveSession,
  numbers: buildNumberSession,
  verbs: buildVerbSession,
};

/** Spreads the count evenly over the chosen drills, then deals the questions out in random order. */
export function buildShuffleSession(config: Config, seed = Date.now()): Exercise[] {
  const rng = makeRng(seed);
  const kinds = config.mix?.length ? config.mix : [...DRILL_KINDS];

  const counts = new Map<DrillKind, number>();
  let pool: DrillKind[] = [];
  for (let i = 0; i < config.count; i++) {
    if (pool.length === 0) pool = shuffle(kinds, rng);
    const kind = pool.pop()!;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }

  const exercises: Exercise[] = [];
  for (const [kind, count] of counts) {
    const drillConfig: Config = { ...MIX_CONFIGS[kind], count, answerMode: config.answerMode };
    for (const exercise of BUILDERS[kind](drillConfig, Math.floor(rng() * 1_000_000))) {
      exercises.push({ ...exercise, id: `${kind}:${exercise.id}`, kind });
    }
  }
  return shuffle(exercises, rng);
}
