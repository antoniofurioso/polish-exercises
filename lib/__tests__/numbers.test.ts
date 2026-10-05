import { describe, expect, it } from "vitest";
import { renderSolution } from "../generate";
import { grade } from "../grade";
import { buildNumberSession, countedCell } from "../numbers";
import { cardinal, government } from "../numerals";
import { parseSession, sessionParams } from "../session";
import { NUMBER_CASES, NUMBER_DRILLS } from "../types";
import type { Config, NumberDrill } from "../types";

const config = (over: Partial<Config> = {}): Config => ({
  kind: "numbers",
  cases: [...NUMBER_CASES],
  numbers: ["sg"],
  mode: "nouns",
  count: 30,
  max: 1000,
  ...over,
});

describe("countedCell", () => {
  it("lets jeden take the case the sentence assigns", () => {
    expect(countedCell(1, "mInanim", "acc")).toEqual({ case: "acc", number: "sg" });
    expect(countedCell(1, "f", "loc")).toEqual({ case: "loc", number: "sg" });
  });

  it("keeps 2-4 in the plural of the sentence's own case", () => {
    expect(countedCell(2, "mInanim", "nom")).toEqual({ case: "nom", number: "pl" });
    expect(countedCell(3, "f", "acc")).toEqual({ case: "acc", number: "pl" });
  });

  it("drags 5 and up into the genitive plural", () => {
    expect(countedCell(5, "f", "nom")).toEqual({ case: "gen", number: "pl" });
    expect(countedCell(12, "n", "acc")).toEqual({ case: "gen", number: "pl" });
    expect(countedCell(2, "mPers", "acc")).toEqual({ case: "gen", number: "pl" });
  });

  it("leaves the quantifier rule behind outside the nominative", () => {
    expect(countedCell(5, "f", "ins")).toEqual({ case: "ins", number: "pl" });
    expect(countedCell(2, "mPers", "dat")).toEqual({ case: "dat", number: "pl" });
  });
});

describe("buildNumberSession", () => {
  it("returns as many exercises as were asked for", () => {
    expect(buildNumberSession(config({ count: 25 }), 1)).toHaveLength(25);
  });

  it("is deterministic for a seed", () => {
    const a = buildNumberSession(config(), 99).map((e) => renderSolution(e));
    const b = buildNumberSession(config(), 99).map((e) => renderSolution(e));
    expect(a).toEqual(b);
  });

  it("builds every drill on its own", () => {
    for (const drill of NUMBER_DRILLS) {
      const session = buildNumberSession(config({ drills: [drill as NumberDrill] }), 5);
      expect(session).toHaveLength(30);
      for (const exercise of session) {
        expect(exercise.answers[0]).toBeTruthy();
        expect(exercise.answers[0]).not.toMatch(/undefined/);
        expect(renderSolution(exercise)).not.toMatch(/\{|\}|undefined/);
        expect(grade(exercise.answers[0], exercise)).toBe("correct");
      }
    }
  });

  it("offers real options in multiple choice", () => {
    const session = buildNumberSession(config({ answerMode: "choice" }), 3);
    const withOptions = session.filter((e) => e.options);
    expect(withOptions.length).toBeGreaterThan(session.length / 2);
    for (const exercise of withOptions) {
      expect(new Set(exercise.options).size).toBe(exercise.options!.length);
      expect(exercise.options).toContain(exercise.answers[0]);
    }
  });

  it("keeps the counting drill honest about the case it teaches", () => {
    const session = buildNumberSession(config({ drills: ["count"], count: 60 }), 11);
    for (const exercise of session) {
      // the numeral sits in the visible part of the sentence
      const before = exercise.before.trim();
      expect(before.split(" ").length).toBeGreaterThan(1);
      if (exercise.case === "gen" && exercise.number === "pl") continue;
      expect(exercise.number).toBe(/\bjed(en|na|no)$/.test(before) ? "sg" : "pl");
    }
  });

  it("still fills a long session off an exhausted pool, repeating rather than dropping", () => {
    // 15 neuter nouns x 28 numerals = 420 distinct dative questions, and we ask 500
    const session = buildNumberSession(
      config({ drills: ["numeral"], genders: ["n"], cases: ["dat"], count: 500 }),
      13,
    );
    expect(session).toHaveLength(500);
    expect(new Set(session.map((e) => e.id)).size).toBeLessThan(500); // it repeated
    for (const exercise of session) {
      expect(exercise.case).toBe("dat");
      expect(grade(exercise.answers[0], exercise)).toBe("correct");
    }
  });

  it("only spells numbers inside the chosen range", () => {
    const session = buildNumberSession(config({ drills: ["spell"], max: 20, count: 40 }), 4);
    for (const exercise of session) {
      const n = Number(exercise.hint);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(20);
      expect(exercise.answers[0]).toBe(cardinal(n));
    }
  });

  it("drills only the cases it was given", () => {
    const session = buildNumberSession(config({ drills: ["numeral"], cases: ["ins"] }), 8);
    for (const exercise of session) expect(exercise.case).toBe("ins");
  });

  it("draws only from the chosen genders", () => {
    const session = buildNumberSession(config({ drills: ["count"], genders: ["n"] }), 6);
    // every neuter noun in the lexicon ends its nominative singular in -o, -e or -ę
    for (const exercise of session) {
      expect(government(1, "n")).toBe("nomSg"); // guards the fixture, not the session
      expect(exercise.hint).toMatch(/[oeęum]$/);
    }
  });
});

describe("session round trip", () => {
  it("carries the numbers settings through the URL", () => {
    const original = config({ drills: ["count", "ordinal"], max: 1000, answerMode: "choice" });
    const parsed = parseSession(new URLSearchParams(sessionParams(original, 42)));
    expect(parsed?.seed).toBe(42);
    expect(parsed?.config.kind).toBe("numbers");
    expect(parsed?.config.drills).toEqual(["count", "ordinal"]);
    expect(parsed?.config.max).toBe(1000);
    expect(parsed?.config.answerMode).toBe("choice");
  });

  it("drops a drill list that names every drill", () => {
    const parsed = parseSession(
      new URLSearchParams(sessionParams(config({ drills: [...NUMBER_DRILLS] }), 1)),
    );
    expect(parsed?.config.drills).toBeUndefined();
  });

  it("ignores a range it does not offer", () => {
    const params = new URLSearchParams(sessionParams(config({ max: undefined }), 1));
    params.set("max", "777");
    const parsed = parseSession(params);
    expect(parsed?.config.max).toBeUndefined();
  });
});
