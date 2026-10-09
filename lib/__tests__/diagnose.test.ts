import { describe, expect, it } from "vitest";
import { diagnoseMiss, explainMiss } from "../diagnose";
import { possessivesCards } from "../cards/possessives";
import { pronounsCards } from "../cards/pronouns";
import { buildPossessiveSession } from "../possessives";
import { buildPronounSession } from "../pronouns";
import { MISS_KINDS, PRONOUN_CASES } from "../types";
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

/** A demonstrative or possessive question, as its card source would build it. */
function agreementEx(card: string, answer: string): Exercise {
  const parts = card.split(":")[1].split("|");
  const [kase, number] = card.startsWith("pronouns:") ? [parts[0], parts[2]] : [parts[1], parts[3]];
  return {
    id: "t",
    case: kase as Case,
    number: number as GramNumber,
    before: "",
    after: ".",
    tokens: [{ text: answer, blank: true }],
    hint: "",
    en: "",
    answers: [answer],
    note: "",
    card,
  };
}

describe("diagnoseMiss", () => {
  const kind = (input: string, e: Exercise) => diagnoseMiss(input, e)?.kind;

  it("is null for a right answer", () => {
    expect(diagnoseMiss("kotem", ex("kot", "ins", "sg"))).toBeNull();
    expect(diagnoseMiss("tego", agreementEx("pronouns:gen|n|sg", "tego"))).toBeNull();
  });

  it("classifies case-drill misses", () => {
    expect(kind("", ex("kot", "ins", "sg"))).toBe("empty");
    expect(kind("kota", ex("kot", "ins", "sg"))).toBe("case");
    expect(kind("kotami", ex("kot", "ins", "sg"))).toBe("number");
    expect(kind("kotów", ex("kot", "ins", "sg"))).toBe("caseNumber");
    expect(kind("stołu", ex("stół", "acc", "sg"))).toBe("accAnimacy");
    expect(kind("kot", ex("kot", "acc", "sg"))).toBe("accAnimacy");
    expect(kind("czarną kotem", ex("kot", "ins", "sg", { adj: "czarny" }))).toBe("gender");
    expect(kind("kotum", ex("kot", "ins", "sg"))).toBe("ending");
    expect(kind("ktoem", ex("kot", "ins", "sg"))).toBe("typo");
    expect(kind("banan", ex("kot", "ins", "sg"))).toBe("other");
    expect(kind("kotem", ex("kot", "ins", "sg", { adj: "czarny" }))).toBe("wordCount");
    expect(kind("czarnym kotem", ex("kot", "ins", "sg"))).toBe("wordCount");
  });

  it("carries exactly the text explainMiss shows", () => {
    for (const mode of ["nouns", "adjectives", "both"] as WordMode[]) {
      const config: Config = { cases: [...CASES], numbers: ["sg", "pl"], mode, count: 30 };
      for (const exercise of buildSession(config, 5)) {
        for (const attempt of ["banan", "", exercise.answers[0] + "u", "x y z", exercise.answers[0]]) {
          const d = diagnoseMiss(attempt, exercise);
          expect(d?.text ?? null).toBe(explainMiss(attempt, exercise));
          if (grade(attempt, exercise) === "wrong") expect(MISS_KINDS).toContain(d!.kind);
        }
      }
    }
  });

  it("reads demonstrative misses off the paradigm", () => {
    // ten stół in the accusative: "tego" is the animate (genitive) form
    expect(kind("tego", agreementEx("pronouns:acc|mInanim|sg", "ten"))).toBe("accAnimacy");
    expect(kind("ten", agreementEx("pronouns:acc|mAnim|sg", "tego"))).toBe("accAnimacy");
    expect(kind("ta", agreementEx("pronouns:acc|f|sg", "tę"))).toBe("case");
    expect(kind("tych", agreementEx("pronouns:gen|f|sg", "tej"))).toBe("number");
    expect(kind("tego", agreementEx("pronouns:gen|f|sg", "tej"))).toBe("gender");
    expect(kind("tamtę", agreementEx("pronouns:acc|f|sg", "tamtą"))).toBe("ending");
    expect(kind("ten pies", agreementEx("pronouns:nom|mAnim|sg", "ten"))).toBe("wordCount");
    expect(kind("", agreementEx("pronouns:nom|mAnim|sg", "ten"))).toBe("empty");
  });

  it("reads possessive misses off the paradigm", () => {
    expect(kind("mój", agreementEx("possessives:moj|acc|mAnim|sg", "mojego"))).toBe("accAnimacy");
    expect(kind("moja", agreementEx("possessives:moj|nom|n|sg", "moje"))).toBe("gender");
    expect(kind("naszym", agreementEx("possessives:nasz|ins|f|sg", "naszą"))).toBe("gender");
    expect(kind("naszymi", agreementEx("possessives:nasz|ins|f|sg", "naszą"))).toBe("number");
    expect(kind("naszych", agreementEx("possessives:nasz|ins|f|sg", "naszą"))).toBe("caseNumber");
    expect(kind("jego", agreementEx("possessives:jej|gen|f|sg", "jej"))).toBe("other");
  });

  it("gives no text outside the case drill, and a kind for every wrong answer", () => {
    const config = { cases: [...PRONOUN_CASES], numbers: ["sg", "pl"], mode: "nouns", count: 20 } as Config;
    const exercises = [...buildPronounSession(config, 4), ...buildPossessiveSession(config, 4)];
    for (const card of [...pronounsCards.all().slice(0, 10), ...possessivesCards.all().slice(0, 10)]) {
      exercises.push((card.id.startsWith("pronouns") ? pronounsCards : possessivesCards).build(card.id, 1)!);
    }
    for (const e of exercises) {
      for (const attempt of ["", "banan", "tych", "moje", e.answers[0] + "a"]) {
        const d = diagnoseMiss(attempt, e);
        if (grade(attempt, e) !== "wrong") continue;
        expect(d).not.toBeNull();
        expect(d!.text).toBeNull();
        expect(MISS_KINDS).toContain(d!.kind);
      }
    }
    // a question from no known drill: just "other"
    expect(diagnoseMiss("x", { ...agreementEx("pronouns:gen|f|sg", "tej"), card: undefined })).toEqual({
      kind: "other",
      text: null,
    });
  });
});
