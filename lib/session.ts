import { CASES, GENDER_GROUPS, PRONOUN_CASES } from "./types";
import type {
  AnswerMode,
  Case,
  Config,
  DemoChoice,
  ExerciseKind,
  GenderGroup,
  GramNumber,
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
  if (config.demo === "ten" || config.demo === "tamten") params.set("demo", config.demo);
  return params.toString();
}

export const randomSeed = () => Math.floor(Math.random() * 1_000_000);

/** Reads a session back out of the URL; null when no valid case is named. */
export function parseSession(params: URLSearchParams): Session | null {
  const kind: ExerciseKind = params.get("type") === "pronouns" ? "pronouns" : "cases";
  const allowed = kind === "pronouns" ? PRONOUN_CASES : CASES;
  const cases = (params.get("cases") ?? "")
    .split(",")
    .filter((c): c is Case => (allowed as readonly string[]).includes(c));
  if (cases.length === 0) return null;

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
      ...(kind === "pronouns" ? { kind } : {}),
      ...(demoChoice ? { demo: demoChoice } : {}),
    },
    seed: Number(params.get("seed")) || 1,
  };
}
