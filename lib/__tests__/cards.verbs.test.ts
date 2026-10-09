import { describe, expect, it } from "vitest";
import verbData from "../../data/verbs.json";
import { TENSE_LEVEL, verbsCards } from "../cards/verbs";
import { grade } from "../grade";
import { FULL_LEXICON } from "../lexicon";
import { LEVELS, TENSES } from "../types";
import type { Config, Exercise, Level } from "../types";
import { TENSE_LABEL, VERBS, buildVerbCard, buildVerbSession, canDrill, diagnoseVerbMiss, parseVerbCard } from "../verbs";

const rank = (l: Level) => LEVELS.indexOf(l);
const SKILL = /^verbs:(present|past|future|futureCompound|imperative)\|[123](sg|pl)$/;

describe("verbs cards: all()", () => {
  const all = verbsCards.all();

  it("lists every drillable verb × tense once, from the published lexicon only", () => {
    const published = new Set(verbData.filter((v) => !("review" in v)).map((v) => v.impf.inf));
    const drafts = verbData.filter((v) => "review" in v).map((v) => v.impf.inf);
    expect(drafts.length).toBeGreaterThan(0);
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    for (const card of all) {
      expect(published.has(parseVerbCard(card.id)!.inf), card.id).toBe(true);
    }
    for (const inf of drafts) {
      expect(all.some((c) => c.id.startsWith(`verbs:${inf}|`))).toBe(false);
      expect(verbsCards.build(`verbs:${inf}|past`, 1)).toBeNull();
    }
    const expected = VERBS.flatMap((v) => TENSES.filter((t) => canDrill(v, t)).map((t) => `verbs:${v.impf.inf}|${t}`));
    expect(all.map((c) => c.id).sort()).toEqual(expected.sort());
  });

  it("levels each card at the higher of its verb's and its tense's level", () => {
    for (const card of all) {
      const { inf, tense } = parseVerbCard(card.id)!;
      const verb = VERBS.find((v) => v.impf.inf === inf)!;
      expect(rank(card.level)).toBe(Math.max(rank(verb.level), rank(TENSE_LEVEL[tense])));
      expect(card.freq).toBe(verb.freq ?? 3);
      expect(card.skill).toBe(`verbs:${tense}`);
    }
  });

  it("orders cards by level, then freq, then tense, then file order", () => {
    const key = (id: string) => {
      const { inf, tense } = parseVerbCard(id)!;
      return [TENSES.indexOf(tense), VERBS.findIndex((v) => v.impf.inf === inf)];
    };
    for (let i = 1; i < all.length; i++) {
      const [a, b] = [all[i - 1], all[i]];
      const order = [rank(a.level) - rank(b.level), a.freq - b.freq, ...key(a.id).map((x, j) => x - key(b.id)[j])];
      expect(order.find((d) => d !== 0), `${a.id} before ${b.id}`).toBeLessThan(0);
    }
  });

  it("filters by level", () => {
    for (const cap of LEVELS) {
      const capped = verbsCards.all(cap);
      expect(capped).toEqual(all.filter((c) => rank(c.level) <= rank(cap)));
    }
    const a1 = verbsCards.all("A1");
    expect(a1.length).toBeGreaterThan(0);
    expect(a1.every((c) => c.id.endsWith("|present"))).toBe(true);
  });

  it("leaves out tenses a verb can't be drilled in", () => {
    // iść is determinate motion: no stretch of time, no habit, so no compound future
    expect(all.some((c) => c.id === "verbs:iść|futureCompound")).toBe(false);
    expect(verbsCards.build("verbs:iść|futureCompound", 1)).toBeNull();
    // an imperfective-only verb has no simple future
    const impfOnly = FULL_LEXICON.verbs.find((v) => !v.pf)!;
    expect(canDrill(impfOnly, "future")).toBe(false);
    expect(buildVerbCard(impfOnly.impf.inf, "future", 1, "typing", FULL_LEXICON.verbs)).toBeNull();
  });
});

describe("verbs cards: build()", () => {
  const all = verbsCards.all();

  it("builds every card, carrying the card and a skill, and grades its own answer right", () => {
    for (const { id, skill } of all) {
      for (const answerMode of ["typing", "choice"] as const) {
        const ex = verbsCards.build(id, 11, answerMode);
        expect(ex, id).not.toBeNull();
        expect(ex!.card).toBe(id);
        expect(ex!.skill).toMatch(SKILL);
        expect(ex!.skill!.startsWith(`${skill}|`)).toBe(true);
        expect(ex!.label).toBe(TENSE_LABEL[parseVerbCard(id)!.tense]);
        expect(grade(ex!.answers[0], ex!)).toBe("correct");
        if (answerMode === "choice") expect(ex!.options).toContain(ex!.answers[0]);
        expect(diagnoseVerbMiss(ex!.answers[0], ex!)).toBeNull();
      }
    }
  });

  it("is deterministic in the seed, and varies with it", () => {
    for (const { id } of all.slice(0, 20)) {
      expect(verbsCards.build(id, 5, "choice")).toEqual(verbsCards.build(id, 5, "choice"));
    }
    const seen = new Set([...Array(20).keys()].map((seed) => verbsCards.build("verbs:pisać|past", seed)!.id));
    expect(seen.size).toBeGreaterThan(5);
  });

  it("returns null for ids it can't build", () => {
    for (const id of ["verbs:nieistnieć|past", "verbs:pisać|pluperfect", "cases:kot|gen|pl", "verbs:pisać", ""]) {
      expect(verbsCards.build(id, 1)).toBeNull();
    }
  });

  it("covers every person each tense has, across seeds", () => {
    const persons = (tense: string) =>
      new Set([...Array(60).keys()].map((seed) => verbsCards.build(`verbs:robić|${tense}`, seed)!.skill));
    expect(persons("present").size).toBe(6);
    expect([...persons("imperative")].sort()).toEqual(["verbs:imperative|1pl", "verbs:imperative|2pl", "verbs:imperative|2sg"]);
  });
});

describe("verbs cards on configured sessions", () => {
  it("stamps card and skill on every exercise a session builds", () => {
    const config: Config = { kind: "verbs", tenses: [...TENSES], cases: ["nom"], numbers: ["sg", "pl"], mode: "nouns", count: 60 };
    const ids = new Set(verbsCards.all().map((c) => c.id));
    for (const seed of [1, 2, 3]) {
      for (const ex of buildVerbSession(config, seed)) {
        expect(ids.has(ex.card!), ex.card).toBe(true);
        expect(ex.skill).toMatch(SKILL);
        expect(ex.label).toBe(TENSE_LABEL[parseVerbCard(ex.card!)!.tense]);
        expect(ex.skill!.split("|")[0]).toBe(`verbs:${parseVerbCard(ex.card!)!.tense}`);
      }
    }
  });
});

describe("verbs cards: skillLabel()", () => {
  it("names tense and person", () => {
    expect(verbsCards.skillLabel("verbs:past|3pl")).toBe("Past tense — 3rd person plural");
    expect(verbsCards.skillLabel("verbs:imperative|2sg")).toBe("Imperative — 2nd person singular");
    expect(verbsCards.skillLabel("verbs:present|1sg")).toBe("Present tense — 1st person singular");
    expect(verbsCards.skillLabel("verbs:futureCompound|1pl")).toBe("Compound future (będę + verb) — 1st person plural");
    expect(verbsCards.skillLabel("verbs:future")).toBe("Simple future (perfective)");
    expect(verbsCards.skillLabel("cases:past")).toBe("cases:past");
  });
});

describe("diagnoseVerbMiss", () => {
  const ex = (card: string, skill: string, answers: string[]): Exercise => ({
    id: "t",
    case: "nom",
    number: skill.endsWith("pl") ? "pl" : "sg",
    before: "",
    after: "",
    tokens: [{ text: answers[0], blank: true }],
    hint: "",
    en: "",
    answers,
    note: "",
    card,
    skill,
  });

  it("past: aspect, person, tense", () => {
    const e = ex("verbs:pisać|past", "verbs:past|1sg", ["napisałem"]);
    expect(diagnoseVerbMiss("pisałem", e)).toBe("aspect");
    expect(diagnoseVerbMiss("pisalem", e)).toBe("aspect");
    expect(diagnoseVerbMiss("napisałeś", e)).toBe("person");
    expect(diagnoseVerbMiss("napisali", e)).toBe("person");
    expect(diagnoseVerbMiss("napiszę", e)).toBe("tense");
    expect(diagnoseVerbMiss("piszę", e)).toBe("tense");
    // a gender slip, a stranger, the answer itself, a diacritics-only miss
    expect(diagnoseVerbMiss("napisałam", e)).toBeNull();
    expect(diagnoseVerbMiss("czytałem", e)).toBeNull();
    expect(diagnoseVerbMiss("napisałem", e)).toBeNull();
    expect(diagnoseVerbMiss("napisalem", e)).toBeNull();
    expect(diagnoseVerbMiss("", e)).toBeNull();
  });

  it("present and simple future: the other aspect's non-past", () => {
    const present = ex("verbs:pisać|present", "verbs:present|1sg", ["piszę"]);
    expect(diagnoseVerbMiss("napiszę", present)).toBe("aspect");
    expect(diagnoseVerbMiss("piszesz", present)).toBe("person");
    expect(diagnoseVerbMiss("pisałem", present)).toBe("tense");
    expect(diagnoseVerbMiss("będę pisać", present)).toBe("tense");

    const future = ex("verbs:pisać|future", "verbs:future|1sg", ["napiszę"]);
    expect(diagnoseVerbMiss("piszę", future)).toBe("aspect");
    expect(diagnoseVerbMiss("będę pisać", future)).toBe("aspect");
    expect(diagnoseVerbMiss("napiszemy", future)).toBe("person");
    expect(diagnoseVerbMiss("napisałem", future)).toBe("tense");
  });

  it("compound future", () => {
    const e = ex("verbs:pisać|futureCompound", "verbs:futureCompound|1sg", ["będę pisać", "będę pisał"]);
    expect(diagnoseVerbMiss("napiszę", e)).toBe("aspect");
    expect(diagnoseVerbMiss("będę napisać", e)).toBe("aspect");
    expect(diagnoseVerbMiss("będziesz pisać", e)).toBe("person");
    expect(diagnoseVerbMiss("pisałem", e)).toBe("tense");
  });

  it("imperative", () => {
    const e = ex("verbs:pisać|imperative", "verbs:imperative|2sg", ["napisz"]);
    expect(diagnoseVerbMiss("pisz", e)).toBe("aspect");
    expect(diagnoseVerbMiss("napiszcie", e)).toBe("person");
    expect(diagnoseVerbMiss("napiszmy", e)).toBe("person");
    expect(diagnoseVerbMiss("napiszesz", e)).toBe("tense");
  });

  it("reflexive verbs, się on either side", () => {
    const e = ex("verbs:uczyć się|present", "verbs:present|1sg", ["uczę się", "się uczę"]);
    expect(diagnoseVerbMiss("nauczę się", e)).toBe("aspect");
    expect(diagnoseVerbMiss("się nauczę", e)).toBe("aspect");
    expect(diagnoseVerbMiss("uczysz się", e)).toBe("person");
    expect(diagnoseVerbMiss("uczyłem się", e)).toBe("tense");
  });

  it("gives null without a verbs card, or for a verb that is gone", () => {
    const e = ex("verbs:pisać|past", "verbs:past|1sg", ["napisałem"]);
    expect(diagnoseVerbMiss("pisałem", { ...e, card: undefined })).toBeNull();
    expect(diagnoseVerbMiss("pisałem", { ...e, card: "verbs:nieistnieć|past" })).toBeNull();
    expect(diagnoseVerbMiss("pisałem", { ...e, skill: "verbs:present|1sg" })).toBeNull();
  });

  it("explains the aspect distractor of real exercises", () => {
    const e = verbsCards.build("verbs:robić|imperative", 3, "choice")!;
    const other = e.options!.filter((o) => !e.answers.includes(o)).map((o) => diagnoseVerbMiss(o, e));
    expect(other.every((k) => k === null || ["aspect", "person", "tense"].includes(k))).toBe(true);
    expect(other.some((k) => k !== null)).toBe(true);
  });
});
