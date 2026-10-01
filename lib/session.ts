import {
  CASES,
  GENDER_GROUPS,
  NUMBER_DRILLS,
  POSSESSIVES,
  PRONOUN_CASES,
  SPELL_RANGES,
  TENSES,
  VERB_TYPES,
} from "./types";
import type {
  AnswerMode,
  Case,
  Config,
  DemoChoice,
  ExerciseKind,
  GenderGroup,
  GramNumber,
  NumberDrill,
  Possessive,
  SpellRange,
  Tense,
  VerbType,
  WordMode,
} from "./types";

const MODES: WordMode[] = ["nouns", "adjectives", "both"];

export type Session = { config: Config; seed: number };

/** Builds the query string that a session lives at. */
export function sessionParams(config: Config, seed: number): string {
  const params = new URLSearchParams({
    cases: config.cases.join(","),
    num: config.numbers.join(","),
    mode: config.mode,
    count: String(config.count),
    seed: String(seed),
  });
  if (config.genders && config.genders.length > 0 && config.genders.length < GENDER_GROUPS.length) {
    params.set("gen", config.genders.join(","));
  }
  if (config.answerMode === "choice") params.set("ans", "choice");
  if (config.kind === "pronouns") params.set("type", "pronouns");
  if (config.kind === "possessives") params.set("type", "possessives");
  if (config.kind === "numbers") params.set("type", "numbers");
  if (config.kind === "verbs") params.set("type", "verbs");
  if (config.tenses && config.tenses.length > 0 && config.tenses.length < TENSES.length) {
    params.set("tenses", config.tenses.join(","));
  }
  if (config.verbType === "plain" || config.verbType === "reflexive") {
    params.set("vt", config.verbType);
  }
  if (config.drills && config.drills.length > 0 && config.drills.length < NUMBER_DRILLS.length) {
    params.set("drills", config.drills.join(","));
  }
  if (config.max) params.set("max", String(config.max));
  if (config.demo === "ten" || config.demo === "tamten") params.set("demo", config.demo);
  if (config.owners && config.owners.length > 0 && config.owners.length < POSSESSIVES.length) {
    params.set("own", config.owners.join(","));
  }
  return params.toString();
}

export const randomSeed = () => Math.floor(Math.random() * 1_000_000);

/** Reads a session back out of the URL; null when no valid case is named. */
export function parseSession(params: URLSearchParams): Session | null {
  const type = params.get("type");
  const kind: ExerciseKind =
    type === "pronouns" || type === "possessives" || type === "numbers" || type === "verbs"
      ? type
      : "cases";
  const allowed = kind === "cases" ? CASES : PRONOUN_CASES;
  const cases = (params.get("cases") ?? "")
    .split(",")
    .filter((c): c is Case => (allowed as readonly string[]).includes(c));
  if (cases.length === 0) return null;

  const owners = (params.get("own") ?? "")
    .split(",")
    .filter((o): o is Possessive => (POSSESSIVES as readonly string[]).includes(o));

  const drills = (params.get("drills") ?? "")
    .split(",")
    .filter((d): d is NumberDrill => (NUMBER_DRILLS as readonly string[]).includes(d));

  const tenses = (params.get("tenses") ?? "")
    .split(",")
    .filter((t): t is Tense => (TENSES as readonly string[]).includes(t));

  const vt = params.get("vt") as VerbType;
  const verbType = (VERB_TYPES as readonly string[]).includes(vt) && vt !== "both" ? vt : undefined;

  const max = Number(params.get("max"));
  const spellRange = (SPELL_RANGES as readonly number[]).includes(max)
    ? (max as SpellRange)
    : undefined;

  const demo = params.get("demo");
  const demoChoice: DemoChoice | undefined =
    demo === "ten" || demo === "tamten" ? demo : undefined;

  const numbers = (params.get("num") ?? "")
    .split(",")
    .filter((n): n is GramNumber => n === "sg" || n === "pl");
  const mode = (params.get("mode") ?? "") as WordMode;
  const count = Number(params.get("count"));

  const answerMode = params.get("ans") as AnswerMode;

  const genders = (params.get("gen") ?? "")
    .split(",")
    .filter((g): g is GenderGroup => (GENDER_GROUPS as readonly string[]).includes(g));

  return {
    config: {
      cases,
      numbers: numbers.length ? numbers : ["sg"],
      mode: MODES.includes(mode) ? mode : "nouns",
      count: Number.isFinite(count) ? Math.min(200, Math.max(1, Math.round(count))) : 20,
      ...(genders.length > 0 && genders.length < GENDER_GROUPS.length ? { genders } : {}),
      ...(answerMode === "choice" ? { answerMode } : {}),
      ...(kind !== "cases" ? { kind } : {}),
      ...(demoChoice ? { demo: demoChoice } : {}),
      ...(owners.length > 0 && owners.length < POSSESSIVES.length ? { owners } : {}),
      ...(drills.length > 0 && drills.length < NUMBER_DRILLS.length ? { drills } : {}),
      ...(spellRange ? { max: spellRange } : {}),
      ...(tenses.length > 0 && tenses.length < TENSES.length ? { tenses } : {}),
      ...(verbType ? { verbType } : {}),
    },
    seed: Number(params.get("seed")) || 1,
  };
}
