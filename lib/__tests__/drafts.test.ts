import { afterEach, describe, expect, it, vi } from "vitest";
import adjectiveData from "../../data/adjectives.json";
import agreementData from "../../data/agreement-frames.json";
import collocationData from "../../data/collocations.json";
import countData from "../../data/count-frames.json";
import groupData from "../../data/groups.json";
import nounData from "../../data/nouns.json";
import numeralData from "../../data/numeral-frames.json";
import templateData from "../../data/templates.json";
import verbData from "../../data/verbs.json";
import { buildSession } from "../generate";
import { FULL_LEXICON, INCLUDE_DRAFTS, LEXICON } from "../lexicon";
import { isDraft, loadLexicon, publish } from "../load";
import type { LexiconData } from "../load";
import type { Config, Exercise } from "../types";

/**
 * Drafts stay out of the published lexicon. The draft entries below exist
 * only in this file: they are spliced into copies of the real data, never
 * written to data/.
 */

const DRAFT_NOUN = {
  lemma: "kotek",
  en: "kitten",
  enPl: "kittens",
  level: "A1",
  gender: "mAnim",
  tags: ["animal"],
  sg: ["kotek", "kotka", "kotkowi", "kotka", "kotkiem", "kotku", "kotku"],
  pl: ["kotki", "kotków", "kotkom", "kotki", "kotkami", "kotkach", "kotki"],
  review: "draft",
};
const DRAFT_ADJECTIVE = {
  lemma: "puszysty",
  en: "fluffy",
  level: "A2",
  stem: "puszyst",
  type: "hard",
  virilePl: "puszyści",
  review: "draft",
};
const DRAFT_VERB = {
  en: { base: "stroke", past: "stroked", ing: "stroking" },
  level: "A2",
  impf: {
    inf: "głaskać",
    past: { m: "głaskał", f: "głaskała", vir: "głaskali" },
    pres: ["głaszczę", "głaszczesz", "głaszczą"],
    imp: "głaszcz",
  },
  pf: {
    inf: "pogłaskać",
    past: { m: "pogłaskał", f: "pogłaskała", vir: "pogłaskali" },
    pres: ["pogłaszczę", "pogłaszczesz", "pogłaszczą"],
    imp: "pogłaszcz",
  },
  objects: [{ pl: "kota", en: "the cat" }],
  review: "draft",
};
const tpl = (fields: Record<string, unknown>) => ({
  case: "acc",
  number: "any",
  level: "A1",
  pl: "Głaszczę {NP}.",
  en: "I'm stroking {npDef}.",
  requires: [],
  note: "A direct object takes the accusative.",
  ...fields,
});

/**
 * The real data plus a draft of every kind, and (with `naming`) two new
 * published templates that name the drafts.
 */
function withDrafts(naming = true): LexiconData {
  const clone = <T>(x: T): T => structuredClone(x);
  return {
    nouns: [...clone(nounData), DRAFT_NOUN],
    adjectives: [...clone(adjectiveData), DRAFT_ADJECTIVE],
    collocations: { ...clone(collocationData), kot: [...collocationData.kot, "puszysty"], kotek: ["puszysty", "mały"] },
    groups: clone(groupData),
    templates: [
      ...clone(templateData),
      tpl({ lemmas: ["kotek", "kot"], review: "draft" }),
      ...(naming
        ? [
            // published, but naming only a draft noun: nothing left to say it about
            tpl({ pl: "Tulę {NP}.", lemmas: ["kotek"] }),
            // published, naming a draft noun and a draft adjective next to real ones
            tpl({ pl: "Czeszę {NP}.", requires: ["animal"], excludeLemmas: ["kotek", "słoń"], adjOnly: ["puszysty"] }),
          ]
        : []),
    ],
    verbs: [...clone(verbData), DRAFT_VERB],
    agreement: [...clone(agreementData), tpl({ requires: ["animal"], review: "draft" })],
    counting: [
      ...clone(countData),
      { pl: "Głaszczę {N} {NP}.", en: "I'm stroking {np}.", case: "acc", requires: ["animal"], review: "draft" },
    ],
    numerals: { ...clone(numeralData), voc: { ...numeralData.voc, review: "draft" } },
  };
}

const lemmas = (list: { lemma: string }[]) => list.map((x) => x.lemma);

describe("publish", () => {
  const full = loadLexicon(withDrafts());
  const published = publish(full);

  it("keeps drafts in the full lexicon", () => {
    expect(lemmas(full.nouns)).toContain("kotek");
    expect(lemmas(full.adjectives)).toContain("puszysty");
    expect(full.verbs.map((v) => v.impf.inf)).toContain("głaskać");
    expect(full.templates.some((t) => t.pl === "Głaszczę {NP}.")).toBe(true);
    expect(full.agreement.some(isDraft)).toBe(true);
    expect(full.counting.some(isDraft)).toBe(true);
    expect(full.numerals.voc?.review).toBe("draft");
  });

  it("leaves every draft out of the published lexicon", () => {
    expect(lemmas(published.nouns)).not.toContain("kotek");
    expect(lemmas(published.adjectives)).not.toContain("puszysty");
    expect(published.verbs.map((v) => v.impf.inf)).not.toContain("głaskać");
    for (const list of [published.nouns, published.adjectives, published.verbs, published.templates]) {
      expect(list.some(isDraft)).toBe(false);
    }
    expect(published.agreement).toHaveLength(agreementData.length);
    expect(published.counting).toHaveLength(countData.length);
    expect(Object.keys(published.numerals)).toEqual(["nom", "gen", "dat", "acc", "ins", "loc"]);
  });

  it("leaves no published entry naming a draft", () => {
    expect(published.collocations).not.toHaveProperty("kotek");
    expect(published.collocations.kot).toEqual(collocationData.kot);
    const nouns = new Set(lemmas(published.nouns));
    const adjectives = new Set(lemmas(published.adjectives));
    for (const t of [...published.templates, ...published.agreement, ...published.counting]) {
      for (const lemma of [...(t.lemmas ?? []), ...(t.excludeLemmas ?? [])]) expect(nouns, t.pl).toContain(lemma);
      for (const adj of ("adjOnly" in t ? t.adjOnly : undefined) ?? []) expect(adjectives, t.pl).toContain(adj);
    }
    for (const list of Object.values(published.collocations)) {
      for (const adj of list) expect(adjectives).toContain(adj);
    }
  });

  it("drops a sentence left with no noun, and narrows the rest", () => {
    const pls = published.templates.map((t) => t.pl);
    expect(pls).not.toContain("Głaszczę {NP}."); // a draft
    expect(pls).not.toContain("Tulę {NP}."); // only ever named the draft noun
    const czesze = published.templates.find((t) => t.pl === "Czeszę {NP}.");
    expect(czesze?.excludeLemmas).toEqual(["słoń"]);
    expect(czesze?.adjOnly).toEqual([]); // no adjective at all, rather than a draft one
  });

  it("changes nothing when there are no drafts", () => {
    const again = publish(published);
    expect(again).toStrictEqual(published);
    // entry for entry the same objects, so the generator sees no difference at all
    expect(again.templates.every((t, i) => t === published.templates[i])).toBe(true);
    expect(again.nouns.every((n, i) => n === published.nouns[i])).toBe(true);
  });

  it("strips draft nouns from an agreement frame's lemmas and excludeLemmas, keeping the frame", () => {
    const data = withDrafts(false);
    const frame = tpl({ pl: "Myję {NP}.", requires: ["animal"], lemmas: ["kotek", "dom"], excludeLemmas: ["kotek", "słoń"] });
    data.agreement = [...(data.agreement as object[]), frame];
    const full = loadLexicon(data).agreement.find((t) => t.pl === "Myję {NP}.");
    expect(full).toMatchObject({ lemmas: ["kotek", "dom"], excludeLemmas: ["kotek", "słoń"] });
    const kept = publish(loadLexicon(data)).agreement.find((t) => t.pl === "Myję {NP}.");
    expect(kept).toMatchObject({ lemmas: ["dom"], excludeLemmas: ["słoń"] });
  });

  it("rejects a review mark other than draft", () => {
    const data = withDrafts();
    data.nouns = [{ ...DRAFT_NOUN, review: "approved" }];
    expect(() => loadLexicon(data)).toThrow(/data\/nouns.json: "kotek" has an unknown review "approved"/);
  });
});

describe("the lexicon the drills use", () => {
  it("follows NEXT_PUBLIC_INCLUDE_DRAFTS", () => {
    expect(INCLUDE_DRAFTS).toBe(process.env.NEXT_PUBLIC_INCLUDE_DRAFTS === "1");
    if (INCLUDE_DRAFTS) expect(LEXICON).toBe(FULL_LEXICON);
    else expect(LEXICON).toStrictEqual(publish(FULL_LEXICON));
  });
});

/**
 * The same thing end to end: the generator reloaded over data with the
 * drafts above spliced in (vi.doMock), once per mode.
 */
describe("sessions over data with drafts in it", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    for (const file of FILES) vi.doUnmock(file);
  });

  const FILES = [
    "../../data/nouns.json",
    "../../data/adjectives.json",
    "../../data/collocations.json",
    "../../data/templates.json",
    "../../data/verbs.json",
  ];

  /** buildSession over a fresh load of the lexicon, with the test drafts spliced in or not. */
  async function generator(includeDrafts: boolean, testDrafts = true): Promise<typeof buildSession> {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_INCLUDE_DRAFTS", includeDrafts ? "1" : "");
    if (testDrafts) {
      const data = withDrafts(false);
      vi.doMock("../../data/nouns.json", () => ({ default: data.nouns }));
      vi.doMock("../../data/adjectives.json", () => ({ default: data.adjectives }));
      vi.doMock("../../data/collocations.json", () => ({ default: data.collocations }));
      vi.doMock("../../data/templates.json", () => ({ default: data.templates }));
      vi.doMock("../../data/verbs.json", () => ({ default: data.verbs }));
    }
    return (await import("../generate")).buildSession;
  }

  const config: Config = { kind: "cases", cases: ["acc", "gen", "ins"], numbers: ["sg", "pl"], mode: "both", count: 30 };
  const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
  const uses = (ex: Exercise) => ex.source?.noun.lemma === "kotek" || ex.source?.adj?.lemma === "puszysty";
  const strip = (e: Exercise) => ({ ...e, source: e.source && [e.source.noun.lemma, e.source.adj?.lemma] });

  it("never shows a draft when drafts are off, and generates exactly what it did without them", async () => {
    const plain = await generator(false, false);
    const before = SEEDS.map((seed) => plain(config, seed).map(strip));
    const build = await generator(false);
    for (const [i, seed] of SEEDS.entries()) {
      const session = build(config, seed);
      expect(session.some(uses)).toBe(false);
      expect(session.map(strip)).toEqual(before[i]);
    }
  });

  it("uses the drafts when they are on", async () => {
    const build = await generator(true);
    expect(SEEDS.some((seed) => build(config, seed).some(uses))).toBe(true);
  });
});
