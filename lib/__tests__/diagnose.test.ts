import { describe, expect, it } from "vitest";
import { explainMiss } from "../diagnose";
import { ADJECTIVES } from "../adjectives";
import { declineAdjective } from "../declineAdjective";
import { NOUNS } from "../nouns";
import { buildSession } from "../generate";
import { grade } from "../grade";
import { CASES } from "../types";
import type { Adjective, Case, Config, Exercise, GramNumber, Noun, WordMode } from "../types";

const noun = (lemma: string): Noun => NOUNS.find((n) => n.lemma === lemma)!;
const adj = (lemma: string): Adjective => ADJECTIVES.find((a) => a.lemma === lemma)!;

/** A minimal exercise around one noun (plus adjective) in a given cell. */
function ex(
  lemma: string,
  kase: Case,
  number: GramNumber,
  words: { adj?: string; blankNoun?: boolean } = {},
): Exercise {
  const n = noun(lemma);
  const a = words.adj ? adj(words.adj) : undefined;
  const table = number === "pl" ? n.pl! : n.sg;
  const tokens = a
    ? [
        { text: "", blank: true },
        { text: table[kase], blank: words.blankNoun !== false },
      ]
    : [{ text: table[kase], blank: true }];
  // reuse the real decliner rather than hardcoding endings in the fixture
  if (a) tokens[0].text = declineAdjective(a, n.gender, number, kase);
  return {
    id: "t",
    case: kase,
    number,
    before: "",
    after: ".",
    tokens,
    hint: lemma,
    en: "",
    answers: [tokens.filter((t) => t.blank).map((t) => t.text).join(" ")],
    note: "",
    source: { noun: n, adj: a },
  };
}

describe("explainMiss", () => {
  it("names the case the answer actually is", () => {
    const e = ex("kot", "ins", "sg");
    expect(explainMiss("kota", e)).toMatch(/genitive/);
    expect(explainMiss("kota", e)).toMatch(/here you need the instrumental/);
  });

  it("names the Polish case alongside the English one", () => {
    expect(explainMiss("kotu", ex("kot", "ins", "sg"))).toContain("celownik");
  });

  it("calls out singular vs plural", () => {
    expect(explainMiss("kotami", ex("kot", "ins", "sg"))).toMatch(/plural.*just one/);
    expect(explainMiss("kotem", ex("kot", "ins", "pl"))).toMatch(/singular.*more than one/);
  });

  it("reports case and number together when both are off", () => {
    const miss = explainMiss("kotów", ex("kot", "ins", "sg"))!;
    expect(miss).toMatch(/genitive/);
    expect(miss).toMatch(/plural/);
    expect(miss).toMatch(/instrumental singular/);
  });

  it("explains the accusative animacy rule", () => {
    // stół is inanimate: accusative copies the nominative, not the genitive
    expect(explainMiss("stołu", ex("stół", "acc", "sg"))).toMatch(/inanimate masculine/);
    // kot is animate: accusative copies the genitive
    expect(explainMiss("kot", ex("kot", "acc", "sg"))).toMatch(/animate masculine/);
  });

  it("flags an adjective that agrees with the wrong gender", () => {
    const e = ex("kot", "ins", "sg", { adj: "czarny" });
    const miss = explainMiss("czarną kotem", e)!;
    expect(miss).toMatch(/feminine form/);
    expect(miss).toContain("czarnym");
  });

  it("prefers a real cell of the paradigm over an ending guess", () => {
    // kotom is a genuine form (dative plural), so say so rather than "wrong ending"
    expect(explainMiss("kotom", ex("kot", "ins", "sg"))).toMatch(/dative.*plural/);
  });

  it("falls back to the ending when the form is in no cell at all", () => {
    expect(explainMiss("kotum", ex("kot", "ins", "sg"))).toMatch(/wrong ending: -um instead of -em/);
  });

  it("spots a one-letter slip", () => {
    expect(explainMiss("ktoem", ex("kot", "ins", "sg"))).toMatch(/one letter away/);
  });

  it("says when the word is not the right word at all", () => {
    expect(explainMiss("banan", ex("kot", "ins", "sg"))).toMatch(/isn't a form of “kot”/);
  });

  it("asks for both words when only one is typed", () => {
    const e = ex("kot", "ins", "sg", { adj: "czarny" });
    expect(explainMiss("kotem", e)).toMatch(/Both words/);
  });

  it("says only one word is wanted when the learner types two", () => {
    expect(explainMiss("czarnym kotem", ex("kot", "ins", "sg"))).toMatch(/Only the noun/);
  });

  it("explains each wrong word of a two-word answer", () => {
    const e = ex("kot", "loc", "sg", { adj: "czarny" });
    const miss = explainMiss("czarnego kota", e)!;
    expect(miss).toMatch(/genitive/);
  });

  it("stays quiet on a correct answer and on an empty exercise source", () => {
    const e = ex("kot", "ins", "sg");
    expect(explainMiss("kotem", e)).toBeNull();
    expect(explainMiss("kotem", { ...e, source: undefined })).toBeNull();
  });

  it("never throws and always explains a wrong answer it can parse", () => {
    const MODES: WordMode[] = ["nouns", "adjectives", "both"];
    for (const mode of MODES) {
      const config: Config = { cases: [...CASES], numbers: ["sg", "pl"], mode, count: 30 };
      for (const exercise of buildSession(config, 3)) {
        for (const attempt of ["banan", "", exercise.answers[0] + "u", "x y z"]) {
          const miss = explainMiss(attempt, exercise);
          if (grade(attempt, exercise) === "wrong") {
            expect(miss, `${mode}: ${attempt}`).toBeTruthy();
          }
        }
      }
    }
  });
});
