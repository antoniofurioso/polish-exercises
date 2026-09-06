import { describe, expect, it } from "vitest";
import { buildSession, makeRng, renderPrompt, renderSolution, resolvePrep } from "../generate";
import { grade, normalise } from "../grade";
import { CASES } from "../types";
import type { Case, Config, GramNumber, WordMode } from "../types";

const MODES: WordMode[] = ["nouns", "adjectives", "both"];
const NUMBER_SETS: GramNumber[][] = [["sg"], ["pl"], ["sg", "pl"]];

describe("resolvePrep", () => {
  it("adds -e before consonant clusters", () => {
    expect(resolvePrep("z", "psem")).toBe("z");
    expect(resolvePrep("z", "stołem")).toBe("ze");
    expect(resolvePrep("z", "starym")).toBe("ze");
    expect(resolvePrep("z", "sokiem")).toBe("z");
    expect(resolvePrep("z", "żoną")).toBe("z");
    expect(resolvePrep("w", "wodzie")).toBe("w");
    expect(resolvePrep("w", "wsi")).toBe("we");
    expect(resolvePrep("w", "mieście")).toBe("w");
  });
});

describe("buildSession", () => {
  it("returns the requested number of exercises for every config", () => {
    for (const mode of MODES) {
      for (const numbers of NUMBER_SETS) {
        const config: Config = { cases: [...CASES], numbers, mode, count: 20 };
        const session = buildSession(config, 42);
        expect(session.length, `${mode}/${numbers.join("+")}`).toBe(20);
      }
    }
  });

  it("only produces exercises in the selected cases", () => {
    for (const kase of CASES) {
      const session = buildSession(
        { cases: [kase], numbers: ["sg", "pl"], mode: "both", count: 15 },
        7,
      );
      expect(session.length).toBe(15);
      expect(session.every((ex) => ex.case === kase)).toBe(true);
    }
  });

  it("survives a fuzz run across every config combination", () => {
    let checked = 0;
    for (const mode of MODES) {
      for (const numbers of NUMBER_SETS) {
        for (const kase of CASES) {
          for (let seed = 0; seed < 25; seed++) {
            const session = buildSession(
              { cases: [kase] as Case[], numbers, mode, count: 8 },
              seed,
            );
            expect(session.length).toBe(8);
            for (const ex of session) {
              const prompt = renderPrompt(ex);
              const solution = renderSolution(ex);
              expect(prompt, ex.id).toContain("___");
              expect(prompt).not.toMatch(/\{[^}]*\}/);
              expect(solution).not.toMatch(/\{[^}]*\}/);
              expect(ex.en).not.toMatch(/\{[^}]*\}/);
              expect(ex.answers.length).toBeGreaterThan(0);
              expect(ex.answers.every((a) => a.trim().length > 0)).toBe(true);
              expect(ex.hint.trim().length).toBeGreaterThan(0);
              expect(ex.tokens.some((t) => t.blank)).toBe(true);
              if (mode === "adjectives") {
                expect(ex.tokens.length).toBe(2);
                expect(ex.tokens[1].blank).toBe(false);
              }
              if (mode === "nouns") expect(ex.tokens.length).toBe(1);
              for (const answer of ex.answers) {
                expect(grade(answer, ex)).toBe("correct");
                expect(grade(answer.toUpperCase(), ex)).toBe("correct");
                expect(grade(` ${answer} `, ex)).toBe("correct");
              }
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(4000);
  });

  it("is deterministic for a given seed", () => {
    const config: Config = { cases: [...CASES], numbers: ["sg", "pl"], mode: "both", count: 10 };
    expect(buildSession(config, 99).map((e) => e.id)).toEqual(
      buildSession(config, 99).map((e) => e.id),
    );
  });

  it("rarely repeats the same sentence inside a session", () => {
    const session = buildSession(
      { cases: [...CASES], numbers: ["sg", "pl"], mode: "both", count: 40 },
      3,
    );
    const ids = new Set(session.map((e) => e.id));
    expect(ids.size).toBeGreaterThanOrEqual(38);
  });

  it("keeps the rng stable", () => {
    const rng = makeRng(1);
    const first = [rng(), rng(), rng()];
    const again = makeRng(1);
    expect([again(), again(), again()]).toEqual(first);
  });

  it("normalises punctuation and spacing", () => {
    expect(normalise("  Czarnego   Kota. ")).toBe("czarnego kota");
  });
});
