import { DRILLS } from "./drills";
import { makeRng, shuffle } from "./generate";
import { DRILL_KINDS } from "./types";
import type { Config, DrillKind, Exercise } from "./types";

/**
 * Spreads the count evenly over the chosen drills, then deals the questions out in random order.
 * Each drill runs with its registry `mix` settings. The registry imports this module back, so
 * DRILLS is only read at call time, never while the modules load.
 */
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
    const drill = DRILLS[kind];
    const drillConfig: Config = { ...drill.mix, count, answerMode: config.answerMode };
    for (const exercise of drill.build(drillConfig, Math.floor(rng() * 1_000_000))) {
      exercises.push({ ...exercise, id: `${kind}:${exercise.id}`, kind });
    }
  }
  return shuffle(exercises, rng);
}
