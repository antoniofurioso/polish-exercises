import { describe, expect, it } from "vitest";
import { ADJECTIVES, COLLOCATIONS } from "../adjectives";
import { AGREEMENT_TEMPLATES } from "../agreement";
import { nounsFor } from "../generate";
import { NOUNS } from "../nouns";
import { TEMPLATES } from "../templates";
import { CASES, GENDER_GROUPS } from "../types";

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

describe("sense checks", () => {
  const lemmas = new Set(NOUNS.map((n) => n.lemma));
  const adjectives = new Set(ADJECTIVES.map((a) => a.lemma));

  it("only names nouns and adjectives that exist", () => {
    for (const tpl of [...TEMPLATES, ...AGREEMENT_TEMPLATES]) {
      for (const lemma of [...(tpl.lemmas ?? []), ...(tpl.excludeLemmas ?? [])]) {
        expect(lemmas.has(lemma), `${tpl.pl}: ${lemma}`).toBe(true);
      }
      for (const adj of tpl.adjOnly ?? []) {
        expect(adjectives.has(adj), `${tpl.pl}: ${adj}`).toBe(true);
      }
    }
    for (const [noun, adjs] of Object.entries(COLLOCATIONS)) {
      expect(lemmas.has(noun), noun).toBe(true);
      for (const adj of adjs) expect(adjectives.has(adj), `${noun}: ${adj}`).toBe(true);
    }
  });

  it("gives every noun a collocation entry and puts every adjective to use", () => {
    for (const noun of NOUNS) expect(COLLOCATIONS[noun.lemma], noun.lemma).toBeDefined();
    const used = new Set(Object.values(COLLOCATIONS).flat());
    for (const adj of ADJECTIVES) expect(used.has(adj.lemma), adj.lemma).toBe(true);
  });

  it("leaves every sentence at least two nouns to choose from", () => {
    for (const tpl of TEMPLATES) {
      const numbers = tpl.number === "any" ? (["sg", "pl"] as const) : [tpl.number];
      const most = Math.max(...numbers.map((num) => nounsFor(tpl, num).length));
      expect(most, tpl.pl).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps every agreement case open to every gender and number", () => {
    for (const kase of new Set(AGREEMENT_TEMPLATES.map((t) => t.case))) {
      for (const number of ["sg", "pl"] as const) {
        const tpls = AGREEMENT_TEMPLATES.filter(
          (t) => t.case === kase && (t.number === "any" || t.number === number),
        );
        for (const gender of GENDER_GROUPS) {
          const count = tpls.reduce((sum, t) => sum + nounsFor(t, number, [gender]).length, 0);
          expect(count, `${kase}/${number}/${gender}`).toBeGreaterThan(0);
        }
      }
    }
  });
});
