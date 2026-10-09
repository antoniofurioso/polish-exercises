import { describe, expect, it } from "vitest";
import { numbersCards } from "../cards/numbers";
import { DRILLS } from "../drills";
import { renderSolution } from "../generate";
import { grade } from "../grade";
import { buildNumberSession, countBand, numeralClass, spellMagnitude } from "../numbers";
import { LEVELS, NUMBER_CASES, NUMBER_DRILLS } from "../types";
import type { AnswerMode, Config, Exercise } from "../types";

const ID = /^numbers:(count|numeral|spell|ordinal)\|[^|]+(\|[a-z]+)?$/;

/** The invariants every numbers exercise keeps, as in numbers.fuzz.test.ts. */
function problems(ex: Exercise): string[] {
  const out: string[] = [];
  const rendered = renderSolution(ex);
  if (/[{}]|undefined/i.test(rendered)) out.push(`bad sentence "${rendered}"`);
  if (!ex.answers[0]?.trim()) out.push("empty answer");
  if (grade(ex.answers[0], ex) !== "correct") out.push(`own answer "${ex.answers[0]}" not graded correct`);
  if (ex.options) {
    if (new Set(ex.options).size !== ex.options.length) out.push(`duplicate options ${ex.options}`);
    if (!ex.options.includes(ex.answers[0])) out.push(`options miss the answer ${ex.options}`);
  }
  return out;
}

describe("numbers card source", () => {
  const all = numbersCards.all();

  it("is the registry's card source", () => {
    expect(DRILLS.numbers.cards).toBe(numbersCards);
  });

  it("publishes cards of every sub-drill, with well-formed unique ids", () => {
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    for (const c of all) {
      expect(c.id).toMatch(ID);
      expect(c.skill).toBe(c.id.split("|").slice(0, 2).join("|"));
      expect(c.freq).toBe(3);
    }
    for (const drill of NUMBER_DRILLS) {
      expect(all.some((c) => c.id.startsWith(`numbers:${drill}|`)), drill).toBe(true);
    }
  });

  it("builds every card, for several seeds and both answer modes, with the card asked for", () => {
    const failures: string[] = [];
    for (const c of all) {
      for (const seed of [1, 2, 3, 42, 777]) {
        for (const mode of ["typing", "choice"] as AnswerMode[]) {
          const ex = numbersCards.build(c.id, seed, mode);
          const tag = `${c.id} seed=${seed} ${mode}`;
          if (!ex) {
            failures.push(`${tag}: null`);
            continue;
          }
          if (ex.card !== c.id) failures.push(`${tag}: built ${ex.card}`);
          if (ex.skill !== c.skill) failures.push(`${tag}: skill ${ex.skill}`);
          if (mode === "typing" && ex.options) failures.push(`${tag}: options in typing mode`);
          failures.push(...problems(ex).map((p) => `${tag}: ${p}`));
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("is deterministic in the seed, and the seed matters", () => {
    for (const c of all) {
      const a = numbersCards.build(c.id, 9, "choice");
      const b = numbersCards.build(c.id, 9, "choice");
      expect(a).toEqual(b);
    }
    const spread = new Set([1, 2, 3, 4, 5, 6].map((s) => renderSolution(numbersCards.build("numbers:spell|hundreds", s)!)));
    expect(spread.size).toBeGreaterThan(1);
  });

  it("keeps the facets the card names", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const count = numbersCards.build("numbers:count|teens|acc", seed)!;
      const n = Number(count.id.split("|")[1]);
      expect(n % 100).toBeGreaterThanOrEqual(11);
      expect(n % 100).toBeLessThanOrEqual(19);
      expect(count.case).toBe("gen");

      const men = numbersCards.build("numbers:count|men|nom", seed)!;
      expect(men.source?.noun.gender).toBe("mPers");

      const numeral = numbersCards.build("numbers:numeral|2-4|ins", seed)!;
      expect(numeral.case).toBe("ins");
      expect(["2", "3", "4"]).toContain(numeral.hint);

      const spell = numbersCards.build("numbers:spell|thousands2-4", seed)!;
      expect(Number(spell.hint)).toBeGreaterThanOrEqual(2000);
      expect(Number(spell.hint)).toBeLessThanOrEqual(4999);

      expect(numbersCards.build("numbers:ordinal|time|loc", seed)!.case).toBe("loc");
      expect(numbersCards.build("numbers:ordinal|plain|dat", seed)!.case).toBe("dat");
    }
  });

  it("returns null for ids it cannot build", () => {
    for (const id of [
      "numbers:count|men|gen",
      "numbers:numeral|men|dat",
      "numbers:spell|millions",
      "numbers:ordinal|time|gen",
      "numbers:count|1",
      "cases:kot|gen|pl",
      "",
    ]) {
      expect(numbersCards.build(id, 1), id).toBeNull();
    }
  });

  it("filters by level and orders by level, small numbers first", () => {
    for (const level of LEVELS) {
      const capped = numbersCards.all(level);
      expect(capped.every((c) => LEVELS.indexOf(c.level) <= LEVELS.indexOf(level))).toBe(true);
      expect(capped).toEqual(all.filter((c) => LEVELS.indexOf(c.level) <= LEVELS.indexOf(level)));
    }
    const levels = all.map((c) => LEVELS.indexOf(c.level));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));

    const ids = all.map((c) => c.id);
    const before = (a: string, b: string) => expect(ids.indexOf(a)).toBeLessThan(ids.indexOf(b));
    before("numbers:count|1|nom", "numbers:count|2-4|nom");
    before("numbers:count|2-4|nom", "numbers:count|5+|nom");
    before("numbers:spell|units", "numbers:spell|hundreds");
    before("numbers:spell|hundreds", "numbers:spell|thousands5+");
    expect(numbersCards.all("A1").map((c) => c.id)).toContain("numbers:count|5+|acc");
    expect(numbersCards.all("A1").map((c) => c.id)).not.toContain("numbers:numeral|5+|ins");
  });

  it("labels every skill for a learner", () => {
    for (const c of all) {
      const label = numbersCards.skillLabel(c.skill);
      expect(label, c.skill).not.toBe(c.skill);
      expect(label).not.toMatch(/numbers:|\|/);
    }
    expect(numbersCards.skillLabel("numbers:count|5+")).toBe("Counting with 5 and up (pięć kotów)");
    expect(numbersCards.skillLabel("numbers:nonsense")).toBe("numbers:nonsense");
  });
});

describe("numbers sessions carry cards", () => {
  const config = (answerMode: AnswerMode): Config => ({
    kind: "numbers",
    cases: [...NUMBER_CASES],
    numbers: ["sg"],
    mode: "nouns",
    count: 40,
    max: 9999,
    answerMode,
  });

  it("tags every exercise with a published card id and its skill", () => {
    const published = new Map(numbersCards.all().map((c) => [c.id, c.skill]));
    for (const answerMode of ["typing", "choice"] as AnswerMode[]) {
      for (const seed of [1, 2, 3, 42, 777]) {
        for (const ex of buildNumberSession(config(answerMode), seed)) {
          expect(ex.card, ex.id).toBeDefined();
          expect(published.get(ex.card!), `${ex.id} → ${ex.card}`).toBe(ex.skill);
        }
      }
    }
  });

  it("names the facet the exercise really drills", () => {
    for (const ex of buildNumberSession(config("typing"), 5)) {
      const [, n] = ex.id.split("|");
      if (ex.id.startsWith("count|")) {
        expect(ex.card!.split("|")[1]).toBe(countBand(Number(n), ex.source!.noun.gender));
      } else if (ex.id.startsWith("numeral|")) {
        expect(ex.card).toBe(`numbers:numeral|${ex.card!.split("|")[1]}|${ex.case}`);
      } else if (ex.id.startsWith("spell|")) {
        expect(ex.card).toBe(`numbers:spell|${spellMagnitude(Number(n))}`);
      }
    }
  });
});

describe("facets", () => {
  it("bands the counting numbers by the rule that governs the noun", () => {
    const band = (n: number) => countBand(n, "mInanim");
    expect([1, 2, 4, 5, 10, 20, 100].map(band)).toEqual(["1", "2-4", "2-4", "5+", "5+", "5+", "5+"]);
    expect([11, 12, 14, 19, 112, 113].map(band)).toEqual(Array(6).fill("teens"));
    expect([22, 24, 32, 102, 123].map(band)).toEqual(Array(5).fill("compound2-4"));
    expect([21, 25, 31, 101].map(band)).toEqual(Array(4).fill("compound"));
    expect(countBand(5, "mPers")).toBe("men");
    expect(countBand(1, "mPers")).toBe("1");
  });

  it("classes the numerals by paradigm", () => {
    expect(numeralClass(1, "f", "ins")).toBe("1");
    expect(numeralClass(3, "mPers", "nom")).toBe("men");
    expect(numeralClass(3, "mPers", "dat")).toBe("2-4");
    expect(numeralClass(15, "f", "gen")).toBe("5+");
    expect(numeralClass(100, "n", "acc")).toBe("100");
  });

  it("buckets figures by magnitude", () => {
    expect([0, 10, 11, 19, 20, 99, 100, 999, 1000, 1999, 2000, 4999, 5000, 9999].map(spellMagnitude)).toEqual([
      "units", "units", "teens", "teens", "tens", "tens", "hundreds", "hundreds",
      "thousand", "thousand", "thousands2-4", "thousands2-4", "thousands5+", "thousands5+",
    ]);
  });
});
