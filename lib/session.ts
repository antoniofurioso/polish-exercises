import { CASES } from "./types";
import type { Case, Config, GramNumber, WordMode } from "./types";

const MODES: WordMode[] = ["nouns", "adjectives", "both"];

export type Session = { config: Config; seed: number };

/** Builds the query string that a session lives at. */
export function sessionParams(config: Config, seed: number): string {
  return new URLSearchParams({
    cases: config.cases.join(","),
    num: config.numbers.join(","),
    mode: config.mode,
    count: String(config.count),
    seed: String(seed),
  }).toString();
}

export const randomSeed = () => Math.floor(Math.random() * 1_000_000);

/** Reads a session back out of the URL; null when no valid case is named. */
export function parseSession(params: URLSearchParams): Session | null {
  const cases = (params.get("cases") ?? "")
    .split(",")
    .filter((c): c is Case => (CASES as readonly string[]).includes(c));
  if (cases.length === 0) return null;

  const numbers = (params.get("num") ?? "")
    .split(",")
    .filter((n): n is GramNumber => n === "sg" || n === "pl");
  const mode = (params.get("mode") ?? "") as WordMode;
  const count = Number(params.get("count"));

  return {
    config: {
      cases,
      numbers: numbers.length ? numbers : ["sg"],
      mode: MODES.includes(mode) ? mode : "nouns",
      count: Number.isFinite(count) ? Math.min(200, Math.max(1, Math.round(count))) : 20,
    },
    seed: Number(params.get("seed")) || 1,
  };
}
