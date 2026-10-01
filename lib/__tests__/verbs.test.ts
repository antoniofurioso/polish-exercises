import { describe, expect, it } from "vitest";
import { renderSolution } from "../generate";
import { grade } from "../grade";
import { parseSession, sessionParams } from "../session";
import { TENSES, VERB_TYPES } from "../types";
import type { AnswerMode, Config, GramNumber, Tense } from "../types";
import {
  VERBS,
  buildVerbSession,
  futureCompound,
  futureSimple,
  imperative,
  pastForm,
  presentForm,
  withSie,
} from "../verbs";

const verb = (inf: string) => {
  const v = VERBS.find((x) => x.impf.inf === inf || x.pf.inf === inf);
  if (!v) throw new Error(inf);
  return v.impf.inf === inf ? v.impf : v.pf;
};
const pf = (inf: string) => VERBS.find((x) => x.pf.inf === inf)!.pf;
const pair = (inf: string) =>
  VERBS.find((x) => x.impf.inf === inf || x.pf.inf === inf)!;

describe("pastForm", () => {
  it("builds the regular paradigm", () => {
    const pisac = verb("pisać");
    expect(pastForm(pisac, 1, "m")).toBe("pisałem");
    expect(pastForm(pisac, 2, "m")).toBe("pisałeś");
    expect(pastForm(pisac, 3, "m")).toBe("pisał");
    expect(pastForm(pisac, 1, "f")).toBe("pisałam");
    expect(pastForm(pisac, 2, "f")).toBe("pisałaś");
    expect(pastForm(pisac, 3, "f")).toBe("pisała");
    expect(pastForm(pisac, 1, "vir")).toBe("pisaliśmy");
    expect(pastForm(pisac, 2, "vir")).toBe("pisaliście");
    expect(pastForm(pisac, 3, "vir")).toBe("pisali");
    expect(pastForm(pisac, 1, "nonvir")).toBe("pisałyśmy");
    expect(pastForm(pisac, 3, "nonvir")).toBe("pisały");
  });

  it("handles the irregular stems", () => {
    expect(pastForm(verb("iść"), 1, "m")).toBe("szedłem");
    expect(pastForm(verb("iść"), 1, "f")).toBe("szłam");
    expect(pastForm(verb("iść"), 3, "nonvir")).toBe("szły");
    expect(pastForm(verb("pomóc"), 1, "m")).toBe("pomogłem");
    expect(pastForm(verb("pomóc"), 3, "m")).toBe("pomógł");
    expect(pastForm(verb("wziąć"), 1, "m")).toBe("wziąłem");
    expect(pastForm(verb("wziąć"), 1, "f")).toBe("wzięłam");
    expect(pastForm(verb("jeść"), 1, "vir")).toBe("jedliśmy");
    expect(pastForm(verb("obejrzeć"), 3, "vir")).toBe("obejrzeli");
  });
});

describe("futureSimple", () => {
  it("rebuilds the perfective non-past from three parts", () => {
    expect(futureSimple(pair("zrobić"), 1, "sg")).toBe("zrobię");
    expect(futureSimple(pair("zrobić"), 3, "sg")).toBe("zrobi");
    expect(futureSimple(pair("zrobić"), 1, "pl")).toBe("zrobimy");
    expect(futureSimple(pair("zjeść"), 3, "pl")).toBe("zjedzą");
    expect(futureSimple(pair("zjeść"), 2, "pl")).toBe("zjecie");
    expect(futureSimple(pair("wziąć"), 3, "sg")).toBe("weźmie");
    expect(futureSimple(pair("pójść"), 1, "pl")).toBe("pójdziemy");
    expect(futureSimple(pair("dać"), 2, "pl")).toBe("dacie");
    expect(futureSimple(pair("pomóc"), 3, "sg")).toBe("pomoże");
  });
});

describe("presentForm", () => {
  it("rebuilds the imperfective present", () => {
    expect(presentForm(pair("pisać"), 1, "sg")).toBe("piszę");
    expect(presentForm(pair("pisać"), 3, "sg")).toBe("pisze");
    expect(presentForm(pair("brać"), 1, "pl")).toBe("bierzemy");
    expect(presentForm(pair("jeść"), 3, "pl")).toBe("jedzą");
    expect(presentForm(pair("iść"), 2, "pl")).toBe("idziecie");
    expect(presentForm(pair("dawać"), 3, "sg")).toBe("daje");
    expect(presentForm(pair("kłaść się"), 3, "sg")).toBe("kładzie");
  });
});

describe("withSie", () => {
  it("leaves plain verbs alone", () => {
    expect(withSie(pair("pisać"), "piszę")).toEqual(["piszę"]);
  });

  it("puts się after the verb, or before it mid-sentence", () => {
    expect(withSie(pair("uczyć się"), "uczę")).toEqual([
      "uczę się",
      "się uczę",
    ]);
    expect(withSie(pair("uczyć się"), "ucz", { initial: true })).toEqual([
      "ucz się",
    ]);
    expect(withSie(pair("uczyć się"), "będę uczyć")).toEqual([
      "będę się uczyć",
      "będę uczyć się",
    ]);
  });

  it("drops się from the infinitive in the compound future", () => {
    expect(futureCompound(pair("uczyć się").impf, 1, "sg", "f")).toEqual([
      "będę uczyć",
      "będę uczyła",
    ]);
  });
});

describe("futureCompound", () => {
  it("accepts both the infinitive and the -ł form", () => {
    expect(futureCompound(verb("pisać"), 1, "sg", "f")).toEqual([
      "będę pisać",
      "będę pisała",
    ]);
    expect(futureCompound(verb("pisać"), 3, "pl", "vir")).toEqual([
      "będą pisać",
      "będą pisali",
    ]);
    expect(futureCompound(verb("iść"), 2, "sg", "m")).toEqual([
      "będziesz iść",
      "będziesz szedł",
    ]);
  });
});

describe("imperative", () => {
  it("adds -my / -cie to the ty-form", () => {
    expect(imperative(pf("zrobić"), 2, "sg")).toBe("zrób");
    expect(imperative(pf("zrobić"), 1, "pl")).toBe("zróbmy");
    expect(imperative(pf("zrobić"), 2, "pl")).toBe("zróbcie");
    expect(imperative(verb("brać"), 2, "sg")).toBe("bierz");
    expect(imperative(pf("otworzyć"), 2, "pl")).toBe("otwórzcie");
    expect(imperative(pf("pójść"), 2, "sg")).toBeNull();
  });
});

describe("buildVerbSession", () => {
  it("round-trips through the URL", () => {
    const config: Config = {
      kind: "verbs",
      tenses: ["past", "imperative"],
      cases: ["nom"],
      numbers: ["pl"],
      mode: "nouns",
      count: 12,
    };
    const parsed = parseSession(new URLSearchParams(sessionParams(config, 7)));
    expect(parsed?.config.kind).toBe("verbs");
    expect(parsed?.config.tenses).toEqual(["past", "imperative"]);
    expect(parsed?.config.numbers).toEqual(["pl"]);
  });

  it("keeps reflexive and plain verbs apart", () => {
    const base: Config = {
      kind: "verbs",
      cases: ["nom"],
      numbers: ["sg", "pl"],
      mode: "nouns",
      count: 30,
    };
    for (const ex of buildVerbSession({ ...base, verbType: "reflexive" }, 3)) {
      expect(ex.answers[0]).toMatch(/się/);
    }
    for (const ex of buildVerbSession({ ...base, verbType: "plain" }, 3)) {
      expect(ex.answers[0]).not.toMatch(/się/);
    }
    const parsed = parseSession(
      new URLSearchParams(sessionParams({ ...base, verbType: "reflexive" }, 1)),
    );
    expect(parsed?.config.verbType).toBe("reflexive");
  });

  it("fills every session, grades its own answers right, and keeps options honest", () => {
    const tenseSets: Tense[][] = [...TENSES.map((t) => [t]), [...TENSES]];
    const numberSets: GramNumber[][] = [["sg"], ["pl"], ["sg", "pl"]];
    const modes: AnswerMode[] = ["typing", "choice"];
    for (const seed of [1, 2, 3, 42, 999]) {
      for (const verbType of VERB_TYPES) {
        for (const tenses of tenseSets) {
          for (const numbers of numberSets) {
            for (const answerMode of modes) {
              const config: Config = {
                kind: "verbs",
                tenses,
                cases: ["nom"],
                numbers,
                mode: "nouns",
                count: 15,
                answerMode,
                verbType,
              };
              const session = buildVerbSession(config, seed);
              expect(session).toHaveLength(15);
              for (const ex of session) {
                expect(numbers).toContain(ex.number);
                for (const a of ex.answers)
                  expect(grade(a, ex)).toBe("correct");
                expect(grade(ex.tokens[0].text, ex)).toBe("correct");
                expect(renderSolution(ex)).not.toMatch(/undefined|\{|\}/);
                expect(ex.en).not.toMatch(/undefined|\{|\}/);
                if (ex.options) {
                  expect(new Set(ex.options).size).toBe(ex.options.length);
                  const right = ex.options.filter(
                    (o) => grade(o, ex) === "correct",
                  );
                  expect(right).toHaveLength(1);
                }
              }
            }
          }
        }
      }
    }
  });
});
