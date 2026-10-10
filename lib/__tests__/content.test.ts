import { describe, expect, it } from "vitest";
import adjectiveData from "../../data/adjectives.json";
import agreementData from "../../data/agreement-frames.json";
import collocationData from "../../data/collocations.json";
import countData from "../../data/count-frames.json";
import groupData from "../../data/groups.json";
import nounData from "../../data/nouns.json";
import numeralData from "../../data/numeral-frames.json";
import templateData from "../../data/templates.json";
import verbData from "../../data/verbs.json";
import { AGREEMENT_TEMPLATES } from "../agreement";
import { DRILLS } from "../drills";
import { nounsFor, renderPrompt, renderSolution } from "../generate";
import { grade, normalise } from "../grade";
import {
  loadAdjectives,
  loadCollocations,
  loadGroups,
  loadLexicon,
  loadNouns,
  loadTemplates,
  loadVerbs,
} from "../load";
import { NOUNS } from "../nouns";
import { parseSession, sessionParams } from "../session";
import { TEMPLATES } from "../templates";
import { EXERCISE_KINDS, LEVELS, TENSES, VERB_TYPES, withinLevel } from "../types";
import type { Config, Exercise, ExerciseKind, GramNumber, Level, Template } from "../types";

/**
 * The content gate: a bulk import into data/*.json has to get past this before
 * it can reach a learner. It checks the files themselves, then that every
 * level, A1 upward, still fills a session in every drill without a broken
 * sentence.
 */

/** A deep copy, so a loader cannot lean on anything an earlier import cached. */
const fresh = <T>(raw: T): T => structuredClone(raw);

describe("data files", () => {
  it("pass the loader's validation, loaded fresh", () => {
    const adjectives = loadAdjectives(fresh(adjectiveData));
    const groups = loadGroups(fresh(groupData));
    expect(loadNouns(fresh(nounData))).toHaveLength(nounData.length);
    expect(adjectives).toHaveLength(adjectiveData.length);
    expect(Object.keys(loadCollocations(fresh(collocationData), adjectives)).length).toBeGreaterThan(0);
    // "@relatives" is derived from the nouns in lib/templates.ts, not stored
    expect(loadTemplates(fresh(templateData), { ...groups, relatives: [] })).toHaveLength(templateData.length);
    expect(loadVerbs(fresh(verbData))).toHaveLength(verbData.length);
  });

  it("load as one lexicon, frames included", () => {
    const lexicon = loadLexicon(
      fresh({
        nouns: nounData,
        adjectives: adjectiveData,
        collocations: collocationData,
        groups: groupData,
        templates: templateData,
        verbs: verbData,
        agreement: agreementData,
        counting: countData,
        numerals: numeralData,
      }),
    );
    expect(lexicon.agreement).toHaveLength(agreementData.length);
    expect(lexicon.counting).toHaveLength(countData.length);
    expect(Object.keys(lexicon.numerals)).toEqual(Object.keys(numeralData));
  });

  it("rejects an entry with a missing or unknown level, or a bad freq", () => {
    const [noun] = fresh(nounData);
    const noLevel: Record<string, unknown> = { ...noun };
    delete noLevel.level;
    expect(() => loadNouns([noLevel])).toThrow(/needs a "level"/);
    expect(() => loadNouns([{ ...noun, level: "C1" }])).toThrow(/unknown level "C1"/);
    expect(() => loadNouns([{ ...noun, freq: 0 }])).toThrow(/"freq"/);
    expect(() => loadNouns([{ ...noun, freq: 2.5 }])).toThrow(/"freq"/);
    const [tpl] = fresh(templateData);
    expect(() => loadTemplates([{ ...tpl, level: "a1" }], { relatives: [] })).toThrow(/unknown level/);
  });

  it("has no duplicate lemma within a file", () => {
    const files: [string, string[]][] = [
      ["nouns.json", nounData.map((n) => n.lemma)],
      ["adjectives.json", adjectiveData.map((a) => a.lemma)],
      ["verbs.json", verbData.map((v) => v.impf.inf)],
      ["templates.json", templateData.map((t) => `${t.case} ${t.number} ${t.pl} ${t.requires} ${t.lemmas}`)],
    ];
    for (const [file, keys] of files) {
      const seen = new Set<string>();
      for (const key of keys) {
        expect(seen.has(key), `${file}: "${key}" twice`).toBe(false);
        seen.add(key);
      }
    }
  });

  it("gives every noun, adjective, verb and template a level", () => {
    for (const entry of [...nounData, ...adjectiveData, ...verbData, ...templateData]) {
      expect(LEVELS).toContain(entry.level);
    }
  });
});

/** The numbers a template can be drilled in. */
const numbersOf = (tpl: Template): GramNumber[] => (tpl.number === "any" ? ["sg", "pl"] : [tpl.number]);

/** Lemmas the generator could put in the slot: the same rule the builders use. */
function fitting(tpl: Template, maxLevel?: Level): Set<string> {
  return new Set(numbersOf(tpl).flatMap((n) => nounsFor(tpl, n, undefined, maxLevel).map((x) => x.lemma)));
}

describe("templates and levels", () => {
  const all = [...TEMPLATES, ...AGREEMENT_TEMPLATES];

  it("leave every template at least 3 fitting nouns", () => {
    for (const tpl of all) expect(fitting(tpl).size, `${tpl.case}: ${tpl.pl}`).toBeGreaterThanOrEqual(3);
  });

  it("leave every template a fitting noun at its own level or below", () => {
    for (const tpl of all) {
      expect(fitting(tpl, tpl.level).size, `${tpl.level} ${tpl.case}: ${tpl.pl}`).toBeGreaterThanOrEqual(1);
    }
  });

  it("keep the cases an A1 learner has not met out of an A1 session", () => {
    const session = build(configFor("cases", "A1", "typing"), 1);
    expect(session.every((ex) => ["nom", "gen", "acc", "loc"].includes(ex.case))).toBe(true);
    expect(TEMPLATES.filter((t) => t.case === "voc").every((t) => t.level !== "A1")).toBe(true);
  });

  it("level the lexicon below and at every level", () => {
    // a cap of A1 has to leave a real A1 lexicon, and B2 everything
    expect(NOUNS.filter((n) => withinLevel(n, "A1")).length).toBeGreaterThanOrEqual(40);
    expect(NOUNS.filter((n) => withinLevel(n, "B2"))).toHaveLength(NOUNS.length);
  });
});

/** Each drill as the menu would run it, broad settings, 20 questions. */
const KINDS = EXERCISE_KINDS as readonly ExerciseKind[];
function configFor(kind: ExerciseKind, maxLevel: Level, answerMode: Config["answerMode"]): Config {
  const base = kind === "shuffle"
    ? { kind, cases: ["nom"], numbers: ["sg"], mode: "nouns" } as Config
    : { ...DRILLS[kind].mix, count: 0 } as Config;
  return { ...base, count: 20, answerMode, maxLevel };
}

const build = (config: Config, seed: number) => DRILLS[config.kind ?? "cases"].build(config, seed);

/** Every way the session could come out broken; [] when it is fine. */
function problems(ex: Exercise, maxLevel: Level): string[] {
  const out: string[] = [];
  const slot = /\{[^}]*\}/;
  const prompt = renderPrompt(ex);
  const solution = renderSolution(ex);
  if (ex.answers.length === 0 || ex.answers.some((a) => !a.trim())) out.push("empty answer");
  if (!ex.tokens.some((t) => t.blank)) out.push("no blank");
  if (!prompt.includes("___")) out.push("prompt has no blank");
  for (const [name, text] of [["prompt", prompt], ["solution", solution], ["en", ex.en], ["note", ex.note]]) {
    if (slot.test(text)) out.push(`unresolved slot in ${name}: ${text}`);
  }
  // the only "___" allowed is the one renderPrompt draws for the blank
  for (const text of [ex.before, ex.after, ex.en, solution, ...ex.tokens.map((t) => t.text)]) {
    if (text.includes("___")) out.push(`stray ___: ${text}`);
  }
  if (ex.options) {
    const labels = ex.options.map(normalise);
    if (new Set(labels).size !== labels.length) out.push(`duplicate options: ${ex.options}`);
    if (!ex.options.some((o) => grade(o, ex) === "correct")) out.push(`answer not among ${ex.options}`);
  }
  const { noun, adj } = ex.source ?? {};
  if (noun && !withinLevel(noun, maxLevel)) out.push(`${noun.lemma} is ${noun.level}`);
  if (adj && !withinLevel(adj, maxLevel)) out.push(`${adj.lemma} is ${adj.level}`);
  return out;
}

describe("every level fills every drill", () => {
  for (const maxLevel of LEVELS) {
    for (const kind of KINDS) {
      it(`${kind} at ${maxLevel}`, () => {
        for (const answerMode of ["typing", "choice"] as const) {
          for (let seed = 1; seed <= 10; seed++) {
            const session = build(configFor(kind, maxLevel, answerMode), seed);
            expect(session.length, `${answerMode} seed ${seed}`).toBe(20);
          }
        }
      });
    }
  }
});

describe("every level fills every tense of the verbs drill", () => {
  // imperfective-only and stative verbs sit some tenses out: the rest must fill in
  for (const maxLevel of LEVELS) {
    it(`verbs at ${maxLevel}, one tense at a time`, () => {
      for (const tense of TENSES) {
        for (const verbType of VERB_TYPES) {
          for (let seed = 1; seed <= 5; seed++) {
            const config: Config = {
              kind: "verbs",
              tenses: [tense],
              verbType,
              cases: ["nom"],
              numbers: ["sg", "pl"],
              mode: "nouns",
              count: 20,
              maxLevel,
              answerMode: seed % 2 ? "choice" : "typing",
            };
            const session = build(config, seed);
            expect(session.length, `${tense} ${verbType} seed ${seed}`).toBe(20);
            for (const ex of session) expect(problems(ex, maxLevel)).toEqual([]);
          }
        }
      }
    });
  }
});

/** 200 seeds per drill per level, typing and choice alternating. */
const FUZZ_SEEDS = 200;

describe("content fuzz", () => {
  for (const maxLevel of LEVELS) {
    for (const kind of KINDS) {
      it(`${kind} at ${maxLevel}, ${FUZZ_SEEDS} seeds`, () => {
        const failures: string[] = [];
        let checked = 0;
        for (let seed = 0; seed < FUZZ_SEEDS; seed++) {
          const config = configFor(kind, maxLevel, seed % 2 ? "choice" : "typing");
          for (const ex of build(config, 10_000 + seed)) {
            checked++;
            for (const p of problems(ex, maxLevel)) failures.push(`seed ${seed} ${ex.id}: ${p}`);
          }
        }
        expect(failures.slice(0, 10)).toEqual([]);
        expect(checked).toBe(FUZZ_SEEDS * 20);
      });
    }
  }
});

describe("level in the session URL", () => {
  it("round-trips as lvl, and only when set", () => {
    const config: Config = { kind: "verbs", cases: ["nom"], numbers: ["sg"], mode: "nouns", count: 20 };
    expect(sessionParams(config, 3)).not.toContain("lvl");
    for (const maxLevel of LEVELS) {
      const url = sessionParams({ ...config, maxLevel }, 3);
      expect(new URLSearchParams(url).get("lvl")).toBe(maxLevel);
      expect(parseSession(new URLSearchParams(url))?.config.maxLevel).toBe(maxLevel);
    }
    const bogus = new URLSearchParams(sessionParams(config, 3));
    bogus.set("lvl", "C2");
    expect(parseSession(bogus)?.config).not.toHaveProperty("maxLevel");
  });
});
