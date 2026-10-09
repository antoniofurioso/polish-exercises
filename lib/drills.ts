import { buildSession } from "./generate";
import { buildNumberSession } from "./numbers";
import { buildPossessiveSession } from "./possessives";
import { buildPronounSession } from "./pronouns";
import { buildShuffleSession } from "./shuffle";
import {
  CASES,
  DRILL_KINDS,
  NUMBER_CASES,
  NUMBER_DRILLS,
  POSSESSIVE_CASES,
  POSSESSIVES,
  PRONOUN_CASES,
  SPELL_RANGES,
  TENSES,
} from "./types";
import type { Case, Config, DrillKind, Exercise, ExerciseKind, SpellRange } from "./types";
import { buildVerbSession } from "./verbs";

/** Everything the app needs to know about one exercise, from menu card to URL. */
export type Drill = {
  /** The configurator page. */
  route: string;
  title: string;
  pl: string;
  blurb: string;
  build: (config: Config, seed: number) => Exercise[];
  /** The cases a session URL may name; anything else is dropped. */
  cases: readonly Case[];
  /** Writes the drill's own settings into the query string. */
  serialise?: (config: Config, params: URLSearchParams) => void;
  /** Reads them back, leaving out whatever is absent or invalid. */
  parse?: (params: URLSearchParams) => Partial<Config>;
};

/** The broad settings a drill runs with when it is mixed into a shuffle. */
export type MixConfig = Omit<Config, "count" | "answerMode">;

type Registry = { [K in DrillKind]: Drill & { mix: MixConfig } } & { shuffle: Drill };

/** The comma-separated values of a param that appear in `allowed`. */
function list<T extends string>(params: URLSearchParams, name: string, allowed: readonly T[]): T[] {
  return (params.get(name) ?? "")
    .split(",")
    .filter((v): v is T => (allowed as readonly string[]).includes(v));
}

/** A strict subset is worth keeping; none or all of them means the default. */
function isSubset<T>(values: T[] | undefined, all: readonly T[]): values is T[] {
  return !!values && values.length > 0 && values.length < all.length;
}

export const DRILLS: Registry = {
  cases: {
    route: "/cases",
    title: "Cases",
    pl: "Przypadki",
    blurb: "Decline nouns and adjectives across all seven cases, one sentence at a time.",
    build: buildSession,
    cases: CASES,
    mix: { kind: "cases", cases: [...CASES], numbers: ["sg", "pl"], mode: "both" },
  },
  pronouns: {
    route: "/pronouns",
    title: "Demonstrative pronouns",
    pl: "Zaimki wskazujące",
    blurb: "Make ten / tamten agree with the noun in gender, number and case.",
    build: buildPronounSession,
    cases: PRONOUN_CASES,
    serialise: (config, params) => {
      if (config.demo === "ten" || config.demo === "tamten") params.set("demo", config.demo);
    },
    parse: (params) => {
      const demo = params.get("demo");
      return demo === "ten" || demo === "tamten" ? { demo } : {};
    },
    mix: { kind: "pronouns", cases: [...PRONOUN_CASES], numbers: ["sg", "pl"], mode: "nouns" },
  },
  possessives: {
    route: "/possessives",
    title: "Possessive pronouns",
    pl: "Zaimki dzierżawcze",
    blurb: "Decline mój, twój, nasz, wasz — and learn where jego, jej and ich stay put.",
    build: buildPossessiveSession,
    cases: POSSESSIVE_CASES,
    serialise: (config, params) => {
      if (isSubset(config.owners, POSSESSIVES)) params.set("own", config.owners.join(","));
    },
    parse: (params) => {
      const owners = list(params, "own", POSSESSIVES);
      return isSubset(owners, POSSESSIVES) ? { owners } : {};
    },
    mix: { kind: "possessives", cases: [...POSSESSIVE_CASES], numbers: ["sg", "pl"], mode: "nouns" },
  },
  numbers: {
    route: "/numbers",
    title: "Numbers",
    pl: "Liczebniki",
    blurb: "Why it's dwa koty but pięć kotów — plus writing figures out, dates and the time.",
    build: buildNumberSession,
    cases: NUMBER_CASES,
    serialise: (config, params) => {
      if (isSubset(config.drills, NUMBER_DRILLS)) params.set("drills", config.drills.join(","));
      if (config.max) params.set("max", String(config.max));
    },
    parse: (params) => {
      const drills = list(params, "drills", NUMBER_DRILLS);
      const max = Number(params.get("max"));
      return {
        ...(isSubset(drills, NUMBER_DRILLS) ? { drills } : {}),
        ...((SPELL_RANGES as readonly number[]).includes(max) ? { max: max as SpellRange } : {}),
      };
    },
    mix: { kind: "numbers", cases: [...NUMBER_CASES], numbers: ["sg"], mode: "nouns", max: 100 },
  },
  verbs: {
    route: "/verbs",
    title: "Verbs",
    pl: "Czasowniki",
    blurb: "Past, simple future, compound future (będę robić) and the imperative — with aspect.",
    build: buildVerbSession,
    // the verbs drill has no case, but a session URL still has to name one
    cases: PRONOUN_CASES,
    serialise: (config, params) => {
      if (isSubset(config.tenses, TENSES)) params.set("tenses", config.tenses.join(","));
      if (config.verbType === "plain" || config.verbType === "reflexive") {
        params.set("vt", config.verbType);
      }
    },
    parse: (params) => {
      const tenses = list(params, "tenses", TENSES);
      const vt = params.get("vt");
      return {
        ...(isSubset(tenses, TENSES) ? { tenses } : {}),
        ...(vt === "plain" || vt === "reflexive" ? { verbType: vt } : {}),
      };
    },
    mix: { kind: "verbs", tenses: [...TENSES], cases: ["nom"], numbers: ["sg", "pl"], mode: "nouns" },
  },
  shuffle: {
    route: "/shuffle",
    title: "Shuffle",
    pl: "Mieszanka",
    blurb: "Every exercise mixed into one session — cases, pronouns, numbers and verbs at random.",
    // called through a closure: shuffle.ts imports this registry back, so neither side may
    // touch the other's exports while the modules are still loading
    build: (config, seed) => buildShuffleSession(config, seed),
    cases: PRONOUN_CASES,
    serialise: (config, params) => {
      if (isSubset(config.mix, DRILL_KINDS)) params.set("mix", config.mix.join(","));
    },
    parse: (params) => {
      const mix = list(params, "mix", DRILL_KINDS);
      return isSubset(mix, DRILL_KINDS) ? { mix } : {};
    },
  },
};

/** The registry entry for a config; omitted kind means the case drill. */
export const drillFor = (kind: ExerciseKind | undefined): Drill => DRILLS[kind ?? "cases"];
