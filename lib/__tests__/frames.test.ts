import { describe, expect, it } from "vitest";
import nounData from "../../data/nouns.json";
import { AGREEMENT_TEMPLATES } from "../agreement";
import { ADJECTIVES } from "../adjectives";
import { buildSession, fitsTemplate, nounForm, renderEnglish } from "../generate";
import { LEXICON } from "../lexicon";
import { loadNouns } from "../load";
import { NOUNS } from "../nouns";
import { buildNumberSession, countsIn } from "../numbers";
import { buildPossessiveSession } from "../possessives";
import { TEMPLATES } from "../templates";
import { NUMBER_CASES, POSSESSIVE_CASES } from "../types";
import type { Adjective, Config, Exercise, Noun, Template } from "../types";

/**
 * Which nouns a frame takes, and how the English reads: the fixes that keep
 * the generator from saying "Widzę mojego człowieka", "Opiekuję się drugą
 * kolacją", "dziewiętnaście traw" or "This is a spring". Runs on the published
 * lexicon and, in the drafts project, with every draft in.
 */

const byLemma = new Map(NOUNS.map((n) => [n.lemma, n]));
const numbers = (over: Partial<Config>): Config => ({
  kind: "numbers",
  cases: [...NUMBER_CASES],
  numbers: ["sg"],
  mode: "nouns",
  count: 40,
  ...over,
});
/** Many sessions of one setting, flattened. */
const many = (build: (c: Config, seed: number) => Exercise[], config: Config, seeds = 60) =>
  Array.from({ length: seeds }, (_, i) => build(config, 1000 + i)).flat();

const noun = (fields: Partial<Noun>): Noun => ({
  lemma: "x",
  en: "thing",
  enPl: "things",
  level: "A1",
  gender: "f",
  tags: [],
  sg: { nom: "x", gen: "x", dat: "x", acc: "x", ins: "x", loc: "x", voc: "x" },
  pl: { nom: "x", gen: "x", dat: "x", acc: "x", ins: "x", loc: "x", voc: "x" },
  ...fields,
});
const frame = (en: string): Template => ({
  case: "acc",
  number: "any",
  level: "A1",
  pl: "{NP}",
  en,
  requires: [],
  note: "",
});
const adjective = (en: string): Adjective => ({ lemma: "a", en, level: "A1", stem: "a", type: "hard", virilePl: "a" });

describe("the ordinal drill", () => {
  it("only puts a noun in a frame that takes it", () => {
    const session = many(buildNumberSession, numbers({ drills: ["ordinal"] }));
    const agreement = session.filter((ex) => ex.id.startsWith("ord|"));
    expect(agreement.length).toBeGreaterThan(100);
    for (const ex of agreement) {
      const [, , lemma, pl] = ex.id.split("|");
      const tpl = AGREEMENT_TEMPLATES.find((t) => t.pl === pl && t.case === ex.case)!;
      expect(countsIn(byLemma.get(lemma)!, tpl), ex.id).toBe(true);
    }
  });
});

describe("the count and numeral drills", () => {
  it("count only what the frame takes, and a mass noun only in portions", () => {
    const session = many(buildNumberSession, numbers({ drills: ["count", "numeral"] }));
    const counted = session.filter((ex) => /^(count|numeral)\|/.test(ex.id));
    expect(counted.length).toBeGreaterThan(1000);
    for (const ex of counted) {
      const n = byLemma.get(ex.id.split("|")[2])!;
      expect(!n.mass || n.portions, `${ex.id}: a mass noun counted`).toBe(true);
    }
  });

  it("keep a mass noun out unless it comes in portions or the frame names it", () => {
    const water = noun({ lemma: "woda", tags: ["drink"], mass: true });
    const drinks = { requires: ["drink" as const] };
    expect(countsIn(water, drinks)).toBe(false);
    expect(countsIn({ ...water, portions: true }, drinks)).toBe(true);
    expect(countsIn(water, { ...drinks, lemmas: ["woda"] })).toBe(true);
    expect(countsIn({ ...water, portions: true }, { ...drinks, excludeLemmas: ["woda"] })).toBe(false);
    expect(countsIn(noun({ tags: ["food"] }), drinks)).toBe(false);
  });
});

describe("the possessive drill", () => {
  it("never puts a possessive in front of a noun marked noPossessive", () => {
    const marked = NOUNS.filter((n) => n.noPossessive).map((n) => n.lemma);
    expect(marked.length).toBeGreaterThan(0);
    const config: Config = { kind: "possessives", cases: [...POSSESSIVE_CASES], numbers: ["sg", "pl"], mode: "nouns", count: 30 };
    for (const ex of many(buildPossessiveSession, config)) {
      expect(marked, ex.id).not.toContain(ex.id.split("|")[2]);
    }
  });

  it("honours a frame's excludeLemmas, as every agreement drill does", () => {
    for (const tpl of AGREEMENT_TEMPLATES) {
      for (const lemma of tpl.excludeLemmas ?? []) {
        const n = byLemma.get(lemma);
        if (n) expect(fitsTemplate(n, tpl), `${tpl.pl} ${lemma}`).toBe(false);
      }
    }
  });
});

describe("the English article", () => {
  const season = noun({ en: "spring", enPl: "springs", article: "none", tags: ["time"] });
  const economy = noun({ en: "economy", enPl: "economies", article: "the", tags: ["topic"], mass: true });

  it("leaves a season bare, unless an adjective makes it one of many", () => {
    expect(renderEnglish(frame("This is {np}."), season, undefined, "sg")).toBe("This is spring.");
    expect(renderEnglish(frame("{npDef} is coming."), season, undefined, "sg")).toBe("Spring is coming.");
    expect(renderEnglish(frame("This is {np}."), season, adjective("cold"), "sg")).toBe("This is a cold spring.");
    expect(renderEnglish(frame("{npDef} is over."), season, adjective("long"), "sg")).toBe("The long spring is over.");
  });

  it("keeps 'the' on a noun that always takes it, adjective or not", () => {
    expect(renderEnglish(frame("I'm interested in {np}."), economy, undefined, "sg")).toBe("I'm interested in the economy.");
    expect(renderEnglish(frame("About {npDef}."), economy, adjective("Polish"), "sg")).toBe("About the Polish economy.");
    expect(renderEnglish(frame("I write about {npBare}."), economy, undefined, "sg")).toBe("I write about the economy.");
    expect(renderEnglish(frame("I like {npBare}."), season, undefined, "sg")).toBe("I like spring.");
    // a topic without one stays bare: "about history"
    expect(renderEnglish(frame("About {npDef}."), { ...economy, article: undefined }, undefined, "sg")).toBe("About economy.");
  });

  it("only fixes the singular", () => {
    expect(renderEnglish(frame("These are {np}."), season, undefined, "pl")).toBe("These are springs.");
  });

  it("writes a + other as another", () => {
    const plate = noun({ en: "plate", enPl: "plates" });
    expect(renderEnglish(frame("I need {np}."), plate, adjective("other"), "sg")).toBe("I need another plate.");
    expect(renderEnglish(frame("I need {npDef}."), plate, adjective("other"), "sg")).toBe("I need the other plate.");
    expect(renderEnglish(frame("I need {np}."), plate, adjective("other"), "pl")).toBe("I need other plates.");
  });
});

describe("a plural that looks singular", () => {
  const cases: Config = { kind: "cases", cases: ["gen", "dat", "loc"], numbers: ["sg", "pl"], mode: "nouns", count: 30 };
  const templateOf = (ex: Exercise) =>
    TEMPLATES.find(
      (t) => t.pl === ex.id.split("|")[0] && t.case === ex.case && (t.number === ex.number || t.number === "any"),
    )!;

  it("is drilled as the singular, so the English matches what the learner sees", () => {
    const session = many(buildSession, cases);
    let collapsed = 0;
    for (const ex of session) {
      const n = ex.source!.noun;
      if (!n.pl || n.sg[ex.case] !== n.pl[ex.case]) continue;
      if (ex.number === "pl") expect(templateOf(ex).number, `${ex.id}: "${ex.en}"`).toBe("pl");
      else collapsed++;
    }
    expect(collapsed).toBeGreaterThan(0);
  });

  it("stays plural when the learner asked for plurals only", () => {
    const session = many(buildSession, { ...cases, numbers: ["pl"] }, 20);
    for (const ex of session) expect(ex.number).toBe("pl");
  });

  it("stays plural when an adjective shows the number", () => {
    const session = many(buildSession, { ...cases, mode: "both" }, 20);
    const plural = session.filter((ex) => ex.number === "pl" && ex.source!.adj);
    expect(plural.length).toBeGreaterThan(0);
    for (const ex of plural) expect(ex.answers[0]).not.toBe(nounForm(ex.source!.noun, "sg", ex.case));
  });
});

describe("the noun flags", () => {
  const [kot] = structuredClone(nounData).filter((n: { lemma: string }) => n.lemma === "kot");

  it("are validated by the loader", () => {
    expect(() => loadNouns([{ ...kot, article: "a" }])).toThrow(/unknown article "a"/);
    expect(() => loadNouns([{ ...kot, portions: true }])).toThrow(/"portions"/);
    expect(() => loadNouns([{ ...kot, mass: true, portions: true }])).not.toThrow();
    expect(() => loadNouns([{ ...kot, noPossessive: false }])).toThrow(/"noPossessive"/);
    expect(loadNouns([{ ...kot, article: "none", noPossessive: true }])[0]).toMatchObject({ article: "none", noPossessive: true });
  });

  it("are only set where they mean something", () => {
    for (const n of LEXICON.nouns) if (n.portions) expect(n.mass, n.lemma).toBe(true);
    expect(ADJECTIVES.length).toBeGreaterThan(0);
  });
});
