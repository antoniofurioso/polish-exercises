import { describe, expect, it } from "vitest";
import { casesCards } from "../cards/cases";
import { possessivesCards } from "../cards/possessives";
import { pronounsCards } from "../cards/pronouns";
import type { CardSource } from "../cards";
import { DRILLS } from "../drills";
import { buildSession } from "../generate";
import { NOUNS } from "../nouns";
import { buildPossessiveSession } from "../possessives";
import { buildPronounSession } from "../pronouns";
import { CASES, LEVELS, POSSESSIVE_CASES, PRONOUN_CASES, withinLevel } from "../types";
import type { Config } from "../types";

/** Card sources of the cases, pronoun and possessive drills (plans/phase-2.md §1–2). */
const SOURCES: Record<string, CardSource> = {
  cases: casesCards,
  pronouns: pronounsCards,
  possessives: possessivesCards,
};

const PUBLISHED = new Set(NOUNS.map((n) => n.lemma));

describe.each(Object.entries(SOURCES))("%s cards", (kind, source) => {
  const all = source.all();

  it("is reached through the drill registry", () => {
    expect(DRILLS[kind as "cases"].cards).toBe(source);
  });

  it("lists unique ids of this drill, in introduction order", () => {
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    for (const c of all) {
      expect(c.id.startsWith(`${kind}:`)).toBe(true);
      expect(c.skill.startsWith(`${kind}:`)).toBe(true);
    }
    const keys = all.map((c) => LEVELS.indexOf(c.level) * 10 + c.freq);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });

  it("filters by level", () => {
    for (const level of LEVELS) {
      const within = source.all(level);
      expect(within.every((c) => withinLevel(c, level))).toBe(true);
      expect(within).toEqual(all.filter((c) => withinLevel(c, level)));
    }
    expect(source.all("A1").length).toBeGreaterThan(0);
    expect(source.all("A2").length).toBeGreaterThan(source.all("A1").length);
    expect(source.all("B2")).toEqual(all);
  });

  it("builds every card, with its own id and skill", () => {
    for (const [i, card] of all.entries()) {
      for (const answerMode of ["typing", "choice"] as const) {
        const ex = source.build(card.id, i, answerMode);
        expect(ex, card.id).not.toBeNull();
        expect(ex!.card).toBe(card.id);
        expect(ex!.skill).toBe(card.skill);
        expect(ex!.answers.length).toBeGreaterThan(0);
        expect(ex!.answers.every((a) => a.trim().length > 0)).toBe(true);
        if (answerMode === "choice" && ex!.options) expect(ex!.options).toContain(ex!.answers[0]);
      }
    }
  });

  it("is deterministic in the seed", () => {
    for (const card of all.filter((_, i) => i % 7 === 0)) {
      expect(source.build(card.id, 99, "choice")).toEqual(source.build(card.id, 99, "choice"));
    }
    // and the seed matters somewhere
    const varied = all.slice(0, 40).some((c) => {
      const a = source.build(c.id, 1);
      const b = source.build(c.id, 2);
      return JSON.stringify(a) !== JSON.stringify(b);
    });
    expect(varied).toBe(true);
  });

  it("returns null for ids it does not know", () => {
    expect(source.build(`${kind}:nope|gen|sg`, 1)).toBeNull();
    expect(source.build("verbs:być|past", 1)).toBeNull();
    expect(source.build("", 1)).toBeNull();
  });

  it("labels its skills for learners", () => {
    for (const skill of new Set(all.map((c) => c.skill))) {
      const label = source.skillLabel(skill);
      expect(label).not.toBe(skill);
      expect(label).not.toMatch(/[|:]/);
    }
  });
});

describe("cases cards", () => {
  const all = casesCards.all();

  it("come only from published nouns, in cells a sentence can drill", () => {
    for (const c of all) {
      const [lemma, kase, number] = c.id.slice("cases:".length).split("|");
      expect(PUBLISHED.has(lemma), lemma).toBe(true);
      const noun = NOUNS.find((n) => n.lemma === lemma)!;
      if (number === "pl") expect(noun.noPlural || noun.onlySg || noun.mass).toBeFalsy();
      expect(LEVELS.indexOf(c.level)).toBeGreaterThanOrEqual(LEVELS.indexOf(noun.level));
      expect(c.freq).toBe(noun.freq ?? 3);
      expect(CASES).toContain(kase);
    }
  });

  it("drill the noun alone at A1 and add an adjective from A2 where one fits", () => {
    const a1 = all.filter((c) => c.level === "A1");
    for (const c of a1) {
      const ex = casesCards.build(c.id, 3)!;
      // only a plural spelled like its singular brings an adjective to show the number
      if (ex.source?.adj) {
        expect(ex.number).toBe("pl");
        expect(ex.tokens.every((t) => t.blank)).toBe(true);
      } else {
        expect(ex.tokens).toHaveLength(1);
      }
    }
    const higher = all.filter((c) => c.level !== "A1").map((c) => casesCards.build(c.id, 3)!);
    expect(higher.some((ex) => ex.source?.adj)).toBe(true);
    for (const ex of higher.filter((e) => e.source?.adj)) expect(ex.tokens.every((t) => t.blank)).toBe(true);
  });

  it("keep sentences and adjectives at the card's level", () => {
    for (const c of all.filter((_, i) => i % 5 === 0)) {
      const ex = casesCards.build(c.id, 11)!;
      const adj = ex.source?.adj;
      if (adj) expect(withinLevel(adj, c.level)).toBe(true);
    }
  });

  it("label the skill with the case name", () => {
    expect(casesCards.skillLabel("cases:ins|pl")).toBe("Instrumental plural");
    expect(casesCards.skillLabel("cases:gen|sg")).toBe("Genitive singular");
  });
});

describe("agreement cards", () => {
  it("label their skills", () => {
    expect(pronounsCards.skillLabel("pronouns:gen|sg")).toBe("ten / tamten — genitive singular");
    expect(possessivesCards.skillLabel("possessives:dat|pl")).toBe("Possessives — dative plural");
  });

  it("drill swój only in frames with a subject, never on a noPossessive noun", () => {
    for (const c of possessivesCards.all().filter((c) => c.id.startsWith("possessives:swoj|"))) {
      expect(c.id).not.toMatch(/\|nom\|/);
    }
    for (const c of possessivesCards.all().filter((_, i) => i % 3 === 0)) {
      expect(possessivesCards.build(c.id, 5)!.hint).not.toMatch(/Polak|komar/);
    }
  });
});

describe("configured sessions carry card and skill", () => {
  const configs: [string, (c: Config, seed: number) => ReturnType<typeof buildSession>, Config][] = [
    ["cases", buildSession, { cases: [...CASES], numbers: ["sg", "pl"], mode: "both", count: 40 }],
    ["cases", buildSession, { cases: [...CASES], numbers: ["sg", "pl"], mode: "adjectives", count: 20 }],
    ["pronouns", buildPronounSession, { cases: [...PRONOUN_CASES], numbers: ["sg", "pl"], mode: "nouns", count: 30 }],
    [
      "possessives",
      buildPossessiveSession,
      { cases: [...POSSESSIVE_CASES], numbers: ["sg", "pl"], mode: "nouns", count: 30 },
    ],
  ];

  it.each(configs)("%s", (kind, build, config) => {
    const ids = new Set(SOURCES[kind].all().map((c) => c.id));
    for (const seed of [1, 2, 3]) {
      for (const ex of build(config, seed)) {
        expect(ex.card?.startsWith(`${kind}:`)).toBe(true);
        expect(ex.skill).toBe(`${kind}:${ex.case}|${ex.number}`);
        // every question a session asks is a card the scheduler knows
        expect(ids.has(ex.card!), ex.card).toBe(true);
      }
    }
  });
});
