import { describe, expect, it } from "vitest";
import { CASES } from "../types";
import { NOUNS } from "../nouns";
import { TEMPLATES } from "../templates";

describe("noun lexicon", () => {
  it("has a full singular paradigm for every noun", () => {
    for (const noun of NOUNS) {
      for (const kase of CASES) {
        expect(noun.sg[kase], `${noun.lemma}.sg.${kase}`).toBeTruthy();
      }
    }
  });

  it("has a full plural paradigm unless the noun is singular-only", () => {
    for (const noun of NOUNS) {
      if (noun.noPlural) {
        expect(noun.pl, `${noun.lemma} is marked noPlural`).toBeUndefined();
        continue;
      }
      for (const kase of CASES) {
        expect(noun.pl?.[kase], `${noun.lemma}.pl.${kase}`).toBeTruthy();
      }
    }
  });

  it("has unique lemmas", () => {
    const lemmas = NOUNS.map((n) => n.lemma);
    expect(new Set(lemmas).size).toBe(lemmas.length);
  });
});

describe("templates", () => {
  it("covers every case with at least five templates", () => {
    for (const kase of CASES) {
      const count = TEMPLATES.filter((t) => t.case === kase).length;
      expect(count, `${kase} templates`).toBeGreaterThanOrEqual(5);
    }
  });

  it("only requires tags that at least three nouns carry", () => {
    for (const tpl of TEMPLATES) {
      if (tpl.requires.length === 0) continue;
      const matches = NOUNS.filter((n) => n.tags.some((t) => tpl.requires.includes(t)));
      expect(matches.length, `${tpl.pl}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("never starts a sentence with the slot", () => {
    for (const tpl of TEMPLATES) {
      expect(tpl.pl.startsWith("{NP}"), tpl.pl).toBe(false);
      expect(tpl.pl.includes("{NP}"), tpl.pl).toBe(true);
    }
  });

  it("uses exactly one English noun-phrase placeholder", () => {
    for (const tpl of TEMPLATES) {
      for (const text of [tpl.en, tpl.enPl].filter(Boolean) as string[]) {
        const hits = text.match(/\{np(Def|Bare)?\}/g) ?? [];
        expect(hits.length, text).toBe(1);
      }
    }
  });
});
