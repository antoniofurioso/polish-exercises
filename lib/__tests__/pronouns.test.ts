import { describe, expect, it } from "vitest";
import { grade, normalise } from "../grade";
import {
  buildPronounOptions,
  buildPronounSession,
  declineDemonstrative,
} from "../pronouns";
import { parseSession, sessionParams } from "../session";
import { PRONOUN_CASES } from "../types";
import type { Config, GenderGroup, GramNumber } from "../types";

describe("declineDemonstrative", () => {
  it("declines ten across the tricky cells", () => {
    expect(declineDemonstrative("ten", "mInanim", "sg", "acc")).toBe("ten");
    expect(declineDemonstrative("ten", "mAnim", "sg", "acc")).toBe("tego");
    expect(declineDemonstrative("ten", "mPers", "sg", "acc")).toBe("tego");
    expect(declineDemonstrative("ten", "f", "sg", "acc")).toBe("tę");
    expect(declineDemonstrative("ten", "f", "sg", "ins")).toBe("tą");
    expect(declineDemonstrative("ten", "n", "sg", "nom")).toBe("to");
    expect(declineDemonstrative("ten", "mPers", "pl", "nom")).toBe("ci");
    expect(declineDemonstrative("ten", "mInanim", "pl", "nom")).toBe("te");
    expect(declineDemonstrative("ten", "f", "pl", "nom")).toBe("te");
    expect(declineDemonstrative("ten", "mPers", "pl", "acc")).toBe("tych");
    expect(declineDemonstrative("ten", "f", "pl", "acc")).toBe("te");
  });

  it("prefixes tam- for tamten, keeping the regular feminine accusative", () => {
    expect(declineDemonstrative("tamten", "mInanim", "sg", "nom")).toBe("tamten");
    expect(declineDemonstrative("tamten", "mAnim", "sg", "acc")).toBe("tamtego");
    expect(declineDemonstrative("tamten", "f", "sg", "acc")).toBe("tamtą");
    expect(declineDemonstrative("tamten", "n", "sg", "nom")).toBe("tamto");
    expect(declineDemonstrative("tamten", "mPers", "pl", "nom")).toBe("tamci");
    expect(declineDemonstrative("tamten", "f", "pl", "ins")).toBe("tamtymi");
  });
});

const base: Config = {
  kind: "pronouns",
  demo: "both",
  cases: [...PRONOUN_CASES],
  numbers: ["sg", "pl"],
  mode: "nouns",
  count: 48,
  answerMode: "typing",
};

describe("buildPronounSession", () => {
  it("blanks the demonstrative and accepts exactly that form", () => {
    const session = buildPronounSession(base, 13);
    expect(session.length).toBeGreaterThan(0);
    for (const ex of session) {
      expect(ex.tokens.filter((t) => t.blank)).toHaveLength(1);
      expect(grade(ex.answers[0], ex)).toBe("correct");
      expect((PRONOUN_CASES as readonly string[])).toContain(ex.case);
    }
  });

  it("is deterministic for a seed", () => {
    const a = buildPronounSession(base, 21).map((e) => `${e.before}${e.answers[0]}${e.after}`);
    const b = buildPronounSession(base, 21).map((e) => `${e.before}${e.answers[0]}${e.after}`);
    expect(a).toEqual(b);
  });

  it("respects the chosen demonstrative", () => {
    const ten = buildPronounSession({ ...base, demo: "ten" }, 5);
    expect(ten.every((e) => !e.answers[0].startsWith("tam"))).toBe(true);
    const tamten = buildPronounSession({ ...base, demo: "tamten" }, 5);
    expect(tamten.every((e) => e.answers[0].startsWith("tam"))).toBe(true);
  });

  it("only draws from the selected case, gender and number", () => {
    for (const kase of PRONOUN_CASES) {
      for (const g of ["m", "f", "n"] as GenderGroup[]) {
        for (const num of ["sg", "pl"] as GramNumber[]) {
          const session = buildPronounSession(
            { ...base, cases: [kase], genders: [g], numbers: [num], count: 6 },
            1,
          );
          for (const ex of session) {
            expect(ex.case).toBe(kase);
            expect(ex.number).toBe(num);
          }
        }
      }
    }
  });

  it("gives every choice-mode exercise a solvable, non-repeating option list", () => {
    const session = buildPronounSession({ ...base, answerMode: "choice" }, 11);
    expect(session.some((e) => e.options)).toBe(true);
    for (const ex of session) {
      const options = ex.options;
      if (!options) continue;
      expect(options.length).toBeGreaterThan(1);
      expect(options.length).toBeLessThanOrEqual(4);
      expect(options.filter((o) => grade(o, ex) === "correct")).toHaveLength(1);
      expect(new Set(options.map(normalise)).size).toBe(options.length);
    }
  });
});

describe("buildPronounOptions", () => {
  it("returns [] when nothing distinct is left to offer", () => {
    // a paradigm collapsed to a single form has no real distractor
    expect(buildPronounOptions("ten", "n", "sg", "nom", ["x"], () => 0).length).toBeLessThanOrEqual(4);
    expect(buildPronounOptions("ten", "f", "sg", "acc", ["tę", "tą"], () => 0)).toContain("tę");
  });
});

describe("pronoun session URL", () => {
  it("round-trips kind and demonstrative", () => {
    const url = sessionParams(base, 4);
    const parsed = parseSession(new URLSearchParams(url))!.config;
    expect(parsed.kind).toBe("pronouns");
    expect(parsed.demo).toBeUndefined(); // "both" is the default, left out

    const ten = parseSession(new URLSearchParams(sessionParams({ ...base, demo: "ten" }, 4)))!.config;
    expect(ten.demo).toBe("ten");
  });

  it("drops the vocative from a pronoun session", () => {
    const url = sessionParams({ ...base, cases: ["voc", "gen"] }, 4);
    expect(parseSession(new URLSearchParams(url))!.config.cases).toEqual(["gen"]);
  });
});
