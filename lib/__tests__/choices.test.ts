import { describe, expect, it } from "vitest";
import { buildOptions } from "../choices";
import { buildSession, makeRng } from "../generate";
import { grade, normalise } from "../grade";
import { parseSession, sessionParams } from "../session";
import { CASES } from "../types";
import type { Config, WordMode } from "../types";

const base: Config = {
  cases: [...CASES],
  numbers: ["sg", "pl"],
  mode: "nouns",
  count: 40,
  answerMode: "choice",
};

describe("multiple choice", () => {
  it("attaches options only in choice mode", () => {
    const typed = buildSession({ ...base, answerMode: "typing" }, 7);
    expect(typed.every((e) => e.options === undefined)).toBe(true);

    const chosen = buildSession(base, 7);
    expect(chosen.some((e) => e.options !== undefined)).toBe(true);
  });

  for (const mode of ["nouns", "adjectives", "both"] as WordMode[]) {
    it(`gives every ${mode} exercise a solvable, non-repeating option list`, () => {
      const session = buildSession({ ...base, mode }, 11);
      expect(session.length).toBeGreaterThan(0);
      for (const ex of session) {
        const options = ex.options;
        expect(options, ex.id).toBeDefined();
        expect(options!.length).toBeGreaterThan(1);
        expect(options!.length).toBeLessThanOrEqual(4);

        // exactly one option is accepted, and the others are genuinely different
        const right = options!.filter((o) => grade(o, ex) === "correct");
        expect(right, ex.id).toHaveLength(1);
        expect(new Set(options!.map(normalise)).size).toBe(options!.length);
      }
    });
  }

  it("is deterministic for a seed", () => {
    expect(buildSession(base, 99).map((e) => e.options)).toEqual(
      buildSession(base, 99).map((e) => e.options),
    );
  });

  it("does not offer a plural distractor for a noun with no plural", () => {
    const session = buildSession({ ...base, numbers: ["sg"], count: 60 }, 5);
    for (const ex of session) {
      const noun = ex.source!.noun;
      if (!noun.noPlural && noun.pl) continue;
      for (const option of ex.options ?? []) {
        expect(Object.values(noun.sg)).toContain(
          option.split(" ").pop(),
        );
      }
    }
  });

  it("falls back to typing when the paradigm offers no distractor", () => {
    const ex = buildSession({ ...base, answerMode: "typing", count: 1 }, 3)[0];
    const flat = {
      ...ex,
      source: {
        noun: {
          ...ex.source!.noun,
          pl: undefined,
          alt: undefined,
          noPlural: true,
          sg: Object.fromEntries(CASES.map((c) => [c, "kot"])) as never,
        },
      },
      answers: ["kot"],
      tokens: [{ text: "kot", blank: true }],
    };
    expect(buildOptions(flat, makeRng(1))).toEqual([]);
  });

  it("round-trips the answer mode through the session URL", () => {
    const url = sessionParams(base, 4);
    expect(parseSession(new URLSearchParams(url))!.config.answerMode).toBe("choice");
    const typed = sessionParams({ ...base, answerMode: "typing" }, 4);
    expect(parseSession(new URLSearchParams(typed))!.config.answerMode).toBeUndefined();
  });
});
