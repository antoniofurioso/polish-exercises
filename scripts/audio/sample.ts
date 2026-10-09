/**
 * Every sentence the app can speak, found by sampling each drill with many
 * seeds under every setting that changes what it says, until the drill
 * stops producing anything new.
 *
 * The strings come from the client's own functions (renderPrompt + spokenGap
 * before answering, renderSolution after: components/ExerciseCard.tsx), so the
 * manifest says exactly what the app sends to the Worker.
 *
 * Import this after deciding NEXT_PUBLIC_INCLUDE_DRAFTS: lib/lexicon.ts reads
 * it when it loads (the manifest is published content only).
 */
import { DRILLS } from "../../lib/drills";
import { renderPrompt, renderSolution } from "../../lib/generate";
import { spokenGap } from "../../lib/speak";
import {
  CASES,
  NUMBER_CASES,
  POSSESSIVE_CASES,
  POSSESSIVES,
  PRONOUN_CASES,
  TENSES,
} from "../../lib/types";
import type { Case, Config, DrillKind, Exercise, GramNumber, NumberDrill, SpellRange } from "../../lib/types";

/**
 * The highest figure the spelling drill is pre-rendered up to by default. The
 * /numbers page offers 20, 100, 1000 and 9999: every figure up to 1000 is in
 * the manifest, while 1001–9999 (9,000 more clips, about 0.3M characters, that
 * only the "to 9999" setting asks for) are left out unless `--spell-max 9999`
 * is passed. A figure above the cap is a Worker miss: synthesised by Azure
 * when it is configured, otherwise a 404, and the app reads it with the
 * browser voice instead. Everything else in the numbers drill (counting,
 * numerals, ordinals, dates, times) saturates and is enumerated in full.
 */
export const SPELL_CAP: SpellRange = 1000;

/** One setting to sample a drill under. */
export type Variant = { label: string; config: Config };

const NUMBERS: GramNumber[] = ["sg", "pl"];
const base = { count: 40, answerMode: "typing" as const };

/**
 * The settings that change what a drill says. Narrowing filters (genders,
 * CEFR level cap) only pick a subset of what the unfiltered drill says, so
 * they are not sampled separately; neither is the answer mode, which only adds
 * options. Each variant is one case and one number at a time, so rare
 * combinations get their fair share of draws; the shuffle drill reuses each
 * drill's `mix` settings, sampled here as one more variant.
 */
export function variants(kind: DrillKind, spellMax: SpellRange = SPELL_CAP): Variant[] {
  const out: Variant[] = [{ label: "mix", config: { ...DRILLS[kind].mix, ...base } }];
  const add = (label: string, config: Omit<Config, "count" | "answerMode">) =>
    out.push({ label, config: { ...config, ...base, kind } });

  if (kind === "cases") {
    for (const kase of CASES)
      for (const n of NUMBERS)
        for (const mode of ["nouns", "adjectives", "both"] as const)
          add(`${kase}/${n}/${mode}`, { cases: [kase], numbers: [n], mode });
  }
  if (kind === "pronouns") {
    for (const kase of PRONOUN_CASES)
      for (const n of NUMBERS)
        for (const demo of ["ten", "tamten"] as const)
          add(`${kase}/${n}/${demo}`, { cases: [kase], numbers: [n], mode: "nouns", demo });
  }
  if (kind === "possessives") {
    for (const kase of POSSESSIVE_CASES)
      for (const n of NUMBERS)
        add(`${kase}/${n}`, { cases: [kase], numbers: [n], mode: "nouns", owners: [...POSSESSIVES] });
  }
  if (kind === "verbs") {
    for (const tense of TENSES)
      for (const n of NUMBERS)
        for (const verbType of ["plain", "reflexive"] as const)
          add(`${tense}/${n}/${verbType}`, {
            cases: ["nom"],
            numbers: [n],
            mode: "nouns",
            tenses: [tense],
            verbType,
          });
  }
  if (kind === "numbers") {
    const one = (drill: NumberDrill, kase: Case = "nom") => ({
      cases: [kase],
      numbers: ["sg" as GramNumber],
      mode: "nouns" as const,
      drills: [drill],
    });
    add("count", one("count"));
    for (const kase of NUMBER_CASES) {
      add(`numeral/${kase}`, one("numeral", kase));
      add(`ordinal/${kase}`, one("ordinal", kase));
    }
    add(`spell/${spellMax}`, { ...one("spell"), max: spellMax });
  }
  return out;
}

/** What the app speaks for one exercise: the gapped prompt, then the full sentence. */
export function spoken(exercise: Exercise): string[] {
  return [spokenGap(renderPrompt(exercise)), renderSolution(exercise)];
}

export type SampleOptions = {
  /** Sessions built per round. */
  sessions: number;
  /** A variant is done after this many rounds in a row add nothing new. */
  patience: number;
  /** Hard stop per variant, in rounds. */
  maxRounds: number;
  /** First seed; each session uses the next one. */
  seed: number;
  /** The spelling drill's cap (SPELL_CAP). */
  spellMax: SpellRange;
};

/**
 * 25 sessions of 40 questions a round; 15 quiet rounds in a row (15,000
 * questions with nothing new) end a variant. Two runs from different seeds
 * agree on every count at these settings.
 */
export const DEFAULT_SAMPLING: SampleOptions = {
  sessions: 25,
  patience: 15,
  maxRounds: 2000,
  seed: 1,
  spellMax: SPELL_CAP,
};

export type DrillSample = {
  kind: DrillKind;
  strings: Set<string>;
  sessions: number;
  /** Variants that hit maxRounds before saturating. */
  unsaturated: string[];
};

/** Samples one drill under all its variants until each stops growing. */
export function sampleDrill(kind: DrillKind, options: SampleOptions = DEFAULT_SAMPLING): DrillSample {
  const strings = new Set<string>();
  const unsaturated: string[] = [];
  let seed = options.seed;
  let sessions = 0;
  for (const { label, config } of variants(kind, options.spellMax)) {
    let quiet = 0;
    for (let round = 0; round < options.maxRounds && quiet < options.patience; round++) {
      const before = strings.size;
      for (let i = 0; i < options.sessions; i++) {
        for (const exercise of DRILLS[kind].build(config, seed++)) {
          for (const text of spoken(exercise)) strings.add(text);
        }
        sessions++;
      }
      quiet = strings.size === before ? quiet + 1 : 0;
    }
    if (quiet < options.patience) unsaturated.push(label);
  }
  return { kind, strings, sessions, unsaturated };
}
