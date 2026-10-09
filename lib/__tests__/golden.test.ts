import { describe, expect, it } from "vitest";
import { buildSession } from "../generate";
import { buildNumberSession } from "../numbers";
import { buildPossessiveSession } from "../possessives";
import { buildPronounSession } from "../pronouns";
import { parseSession, sessionParams } from "../session";
import { buildShuffleSession } from "../shuffle";
import { CASES, NUMBER_CASES, POSSESSIVE_CASES, PRONOUN_CASES, TENSES } from "../types";
import type { Config, Exercise } from "../types";
import { buildVerbSession } from "../verbs";

/**
 * Refactor guard: a fixed seed must keep producing exactly the same sessions
 * and the same URLs. Update the snapshot only when content is meant to change.
 */
const CONFIGS: Record<string, Config> = {
  cases: { kind: "cases", cases: [...CASES], numbers: ["sg", "pl"], mode: "both", count: 30 },
  pronouns: { kind: "pronouns", cases: [...PRONOUN_CASES], numbers: ["sg", "pl"], mode: "nouns", count: 20 },
  possessives: {
    kind: "possessives",
    cases: [...POSSESSIVE_CASES],
    numbers: ["sg", "pl"],
    mode: "nouns",
    count: 20,
  },
  numbers: { kind: "numbers", cases: [...NUMBER_CASES], numbers: ["sg"], mode: "nouns", count: 20, max: 1000 },
  verbs: { kind: "verbs", tenses: [...TENSES], cases: ["nom"], numbers: ["sg", "pl"], mode: "nouns", count: 30 },
  shuffle: { kind: "shuffle", cases: ["nom"], numbers: ["sg"], mode: "nouns", count: 30 },
};

const BUILD: Record<string, (config: Config, seed: number) => Exercise[]> = {
  cases: buildSession,
  pronouns: buildPronounSession,
  possessives: buildPossessiveSession,
  numbers: buildNumberSession,
  verbs: buildVerbSession,
  shuffle: buildShuffleSession,
};

/** Lexicon entries can gain metadata (level, freq) without that counting as a content change. */
const strip = (e: Exercise) => ({
  ...e,
  source: e.source && { noun: e.source.noun.lemma, adj: e.source.adj?.lemma },
});

describe("golden sessions", () => {
  for (const [kind, config] of Object.entries(CONFIGS)) {
    for (const answerMode of ["typing", "choice"] as const) {
      it(`${kind} / ${answerMode}`, () => {
        const c: Config = { ...config, answerMode };
        const sessions = [1, 42, 777].map((seed) => BUILD[kind](c, seed).map(strip));
        expect(sessions).toMatchSnapshot();
      });
    }
  }

  it("session URLs", () => {
    const urls = Object.values(CONFIGS).map((c) => sessionParams(c, 5));
    expect(urls).toMatchSnapshot();
    for (const [i, c] of Object.values(CONFIGS).entries()) {
      expect(parseSession(new URLSearchParams(urls[i]))?.seed).toBe(5);
      expect(parseSession(new URLSearchParams(urls[i]))?.config.kind ?? "cases").toBe(c.kind);
    }
  });
});
