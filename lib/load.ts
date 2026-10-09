import { ADJ_TYPES, CASES, FREQS, GENDERS, LEVELS, NOUN_ARTICLES, REVIEW_STATES, TAGS } from "./types";
import type {
  Adjective,
  Case,
  CountTemplate,
  Forms,
  Freq,
  Level,
  Noun,
  NumeralTemplate,
  Review,
  Tag,
  Template,
} from "./types";
import type { Verb } from "./verbs";

/**
 * Turns the JSON in data/ into typed lexicon entries. The files are imported
 * statically, so nothing is fetched at run time; these checks run once when a
 * module loads and throw on the first malformed entry, naming its file and
 * lemma (or sentence, for a template). See data/README.md for the schemas.
 */

type Obj = Record<string, unknown>;

/** Named lists the templates refer to as "@name", e.g. "@close". */
export type Groups = Record<string, readonly string[]>;

/** One object under check: typed field readers that throw naming the entry. */
class Entry {
  constructor(
    readonly file: string,
    readonly id: string,
    readonly o: Obj,
    allowed: readonly string[],
  ) {
    for (const key of Object.keys(o)) {
      if (!allowed.includes(key)) this.fail(`has an unknown field "${key}"`);
    }
  }

  fail(message: string): never {
    throw new Error(`data/${this.file}: "${this.id}" ${message}`);
  }

  has(key: string): boolean {
    return key in this.o;
  }

  text(key: string, value: unknown = this.o[key]): string {
    if (typeof value !== "string" || value === "") this.fail(`needs a non-empty string for "${key}"`);
    return value;
  }

  list(key: string, value: unknown = this.o[key]): string[] {
    if (!Array.isArray(value)) this.fail(`needs a list for "${key}"`);
    return value.map((v) => this.text(key, v));
  }

  /** A true / false flag; `onlyTrue` for the ones typed as `true` (reflexive...). */
  flag(key: string, onlyTrue = false): boolean {
    const value = this.o[key];
    if (typeof value !== "boolean" || (onlyTrue && !value)) {
      this.fail(`needs ${onlyTrue ? "true" : "true or false"} for "${key}"`);
    }
    return value;
  }

  oneOf<T extends string>(key: string, allowed: readonly T[], value: unknown = this.o[key]): T {
    if (!allowed.includes(value as T)) this.fail(`has an unknown ${key} "${String(value)}"`);
    return value as T;
  }

  /** The required CEFR level. */
  level(): Level {
    if (!this.has("level")) this.fail(`needs a "level": ${LEVELS.join(", ")}`);
    return this.oneOf("level", LEVELS);
  }

  /** The optional frequency band, 1..5; undefined when the entry has none. */
  freq(): Freq | undefined {
    if (!this.has("freq")) return undefined;
    const value = this.o.freq;
    if (!FREQS.includes(value as Freq)) this.fail(`needs a whole number 1..5 for "freq", got ${String(value)}`);
    return value as Freq;
  }

  /** The optional `"review": "draft"` mark; undefined on a published entry. */
  review(): Review | undefined {
    if (!this.has("review")) return undefined;
    return this.oneOf("review", REVIEW_STATES);
  }

  object(key: string, value: unknown = this.o[key]): Obj {
    if (!isObject(value)) this.fail(`needs an object for "${key}"`);
    return value;
  }

  /** A list with "@group" references spliced in place. */
  expand(key: string, groups: Groups): string[] {
    return this.list(key).flatMap((item) => {
      if (!item.startsWith("@")) return [item];
      const group = groups[item.slice(1)];
      if (!group) this.fail(`refers to an unknown group "${item}" in "${key}"`);
      return [...group];
    });
  }
}

function isObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The top-level list of a file, each item an object. */
function entries(file: string, raw: unknown): Obj[] {
  if (!Array.isArray(raw)) throw new Error(`data/${file}: expected a list of entries`);
  return raw.map((o, i) => {
    if (!isObject(o)) throw new Error(`data/${file}: entry #${i + 1} is not an object`);
    return o;
  });
}

/** What an entry is called in error messages, before its fields are checked. */
const label = (o: Obj, key: string, i: number) => (typeof o[key] === "string" ? (o[key] as string) : `#${i + 1}`);

// ------------------------------------------------------------------ nouns

const NOUN_FIELDS = [
  "lemma",
  "en",
  "enPl",
  "level",
  "freq",
  "gender",
  "tags",
  "sg",
  "pl",
  "mass",
  "portions",
  "noPlural",
  "onlySg",
  "article",
  "noPossessive",
  "alt",
  "review",
];

/** A row of seven forms in CASES order: nom, gen, dat, acc, ins, loc, voc. */
function forms(e: Entry, key: "sg" | "pl"): Forms {
  const row = e.list(key);
  if (row.length !== CASES.length) e.fail(`needs ${CASES.length} "${key}" forms (nom..voc), got ${row.length}`);
  return Object.fromEntries(CASES.map((c, i) => [c, row[i]])) as Forms;
}

export function loadNouns(raw: unknown): Noun[] {
  return entries("nouns.json", raw).map((o, i) => {
    const e = new Entry("nouns.json", label(o, "lemma", i), o, NOUN_FIELDS);
    const noun: Noun = {
      lemma: e.text("lemma"),
      en: e.text("en"),
      enPl: e.text("enPl"),
      level: e.level(),
      gender: e.oneOf("gender", GENDERS),
      tags: e.list("tags").map((t) => e.oneOf<Tag>("tag", TAGS, t)),
      sg: forms(e, "sg"),
    };
    const freq = e.freq();
    if (freq) noun.freq = freq;
    if (e.has("pl")) noun.pl = forms(e, "pl");
    if (e.has("mass")) noun.mass = e.flag("mass");
    if (e.has("noPlural")) noun.noPlural = e.flag("noPlural");
    if (e.has("onlySg")) noun.onlySg = e.flag("onlySg");
    if (noun.noPlural ? noun.pl : !noun.pl) e.fail(`needs "pl" forms unless it is marked "noPlural"`);
    if (e.has("portions")) {
      noun.portions = e.flag("portions", true);
      if (!noun.mass || !noun.pl) e.fail(`has "portions": only a "mass" noun with "pl" forms is counted in portions`);
    }
    if (e.has("article")) noun.article = e.oneOf("article", NOUN_ARTICLES);
    if (e.has("noPossessive")) noun.noPossessive = e.flag("noPossessive", true);
    if (e.has("alt")) {
      const alt = e.object("alt");
      noun.alt = {};
      for (const [cell, values] of Object.entries(alt)) {
        const [number, kase] = cell.split(".");
        if (!["sg", "pl"].includes(number) || !(CASES as readonly string[]).includes(kase)) {
          e.fail(`has an alt key "${cell}"; expected e.g. "pl.gen"`);
        }
        noun.alt[cell] = e.list(`alt.${cell}`, values);
      }
    }
    const review = e.review();
    if (review) noun.review = review;
    return noun;
  });
}

// ------------------------------------------------------------- adjectives

const ADJECTIVE_FIELDS = ["lemma", "en", "level", "freq", "stem", "type", "virilePl", "state", "address", "review"];

export function loadAdjectives(raw: unknown): Adjective[] {
  return entries("adjectives.json", raw).map((o, i) => {
    const e = new Entry("adjectives.json", label(o, "lemma", i), o, ADJECTIVE_FIELDS);
    const adj: Adjective = {
      lemma: e.text("lemma"),
      en: e.text("en"),
      level: e.level(),
      stem: e.text("stem"),
      type: e.oneOf("type", ADJ_TYPES),
      virilePl: e.text("virilePl"),
    };
    if (!adj.lemma.startsWith(adj.stem)) e.fail(`has a stem "${adj.stem}" that does not start the lemma`);
    const freq = e.freq();
    if (freq) adj.freq = freq;
    if (e.has("state")) adj.state = e.flag("state");
    if (e.has("address")) adj.address = e.flag("address");
    const review = e.review();
    if (review) adj.review = review;
    return adj;
  });
}

/** Noun lemma → the adjectives that go with it; every adjective must exist. */
export function loadCollocations(raw: unknown, adjectives: Adjective[]): Record<string, string[]> {
  if (!isObject(raw)) throw new Error("data/collocations.json: expected an object keyed by noun lemma");
  const known = new Set(adjectives.map((a) => a.lemma));
  return Object.fromEntries(
    Object.entries(raw).map(([lemma, value]) => {
      const e = new Entry("collocations.json", lemma, { adjectives: value }, ["adjectives"]);
      const list = e.list("adjectives");
      for (const adj of list) if (!known.has(adj)) e.fail(`names an unknown adjective "${adj}"`);
      return [lemma, list];
    }),
  );
}

// -------------------------------------------------------------- templates

const TEMPLATE_FIELDS = [
  "case",
  "number",
  "level",
  "pl",
  "en",
  "enPl",
  "requires",
  "lemmas",
  "excludeLemmas",
  "states",
  "adjOnly",
  "note",
  "subject",
  "review",
];

/** data/groups.json: each group a list of plain strings (no nested "@" references). */
export function loadGroups(raw: unknown): Groups {
  if (!isObject(raw)) throw new Error("data/groups.json: expected an object of named lists");
  return Object.fromEntries(
    Object.entries(raw).map(([name, value]) => {
      const e = new Entry("groups.json", name, { values: value }, ["values"]);
      const list = e.list("values");
      if (list.some((v) => v.startsWith("@"))) e.fail("cannot refer to another group");
      return [name, list];
    }),
  );
}

/** data/templates.json, or data/agreement-frames.json (same schema) with `file` set. */
export function loadTemplates(raw: unknown, groups: Groups, file = "templates.json"): Template[] {
  return entries(file, raw).map((o, i) => {
    const e = new Entry(file, label(o, "pl", i), o, TEMPLATE_FIELDS);
    const tpl: Template = {
      case: e.oneOf("case", CASES),
      number: e.oneOf("number", ["sg", "pl", "any"] as const),
      level: e.level(),
      pl: e.text("pl"),
      en: e.text("en"),
      requires: e.expand("requires", groups).map((t) => e.oneOf<Tag>("tag", TAGS, t)),
      note: e.text("note"),
    };
    if (e.has("enPl")) tpl.enPl = e.text("enPl");
    if (e.has("lemmas")) tpl.lemmas = e.expand("lemmas", groups);
    if (e.has("excludeLemmas")) tpl.excludeLemmas = e.expand("excludeLemmas", groups);
    if (e.has("states")) tpl.states = e.flag("states");
    if (e.has("adjOnly")) tpl.adjOnly = e.expand("adjOnly", groups);
    if (e.has("subject")) tpl.subject = e.oneOf("subject", ["1sg"] as const);
    const review = e.review();
    if (review) tpl.review = review;
    return tpl;
  });
}

// ------------------------------------------------- count / numeral frames

type NounFilter = Pick<CountTemplate, "requires" | "lemmas" | "excludeLemmas">;

/** The noun filter every frame shares: requires, and optionally lemmas / excludeLemmas. */
function nounFilter(e: Entry, groups: Groups): NounFilter {
  const filter: NounFilter = { requires: e.expand("requires", groups).map((t) => e.oneOf<Tag>("tag", TAGS, t)) };
  if (e.has("lemmas")) filter.lemmas = e.expand("lemmas", groups);
  if (e.has("excludeLemmas")) filter.excludeLemmas = e.expand("excludeLemmas", groups);
  return filter;
}

/** A frame's Polish text, which must hold every slot in `slots`. */
function frameText(e: Entry, slots: string[]): string {
  const pl = e.text("pl");
  for (const slot of slots) if (!pl.includes(slot)) e.fail(`needs a ${slot} slot in "pl"`);
  return pl;
}

const COUNT_FIELDS = ["pl", "en", "case", "requires", "lemmas", "excludeLemmas", "review"];

/** data/count-frames.json: the counting drill's sentences, "Mam {N} {NP}." */
export function loadCountTemplates(raw: unknown, groups: Groups): CountTemplate[] {
  return entries("count-frames.json", raw).map((o, i) => {
    const e = new Entry("count-frames.json", label(o, "pl", i), o, COUNT_FIELDS);
    const tpl: CountTemplate = {
      pl: frameText(e, ["{N}", "{NP}"]),
      en: e.text("en"),
      case: e.oneOf("case", ["nom", "acc"] as const),
      ...nounFilter(e, groups),
    };
    const review = e.review();
    if (review) tpl.review = review;
    return tpl;
  });
}

const NUMERAL_FIELDS = ["pl", "en", "requires", "lemmas", "excludeLemmas", "review"];

/** data/numeral-frames.json: the numeral drill's one sentence per case, keyed by case. */
export function loadNumeralTemplates(raw: unknown, groups: Groups): Partial<Record<Case, NumeralTemplate>> {
  if (!isObject(raw)) throw new Error("data/numeral-frames.json: expected an object keyed by case");
  return Object.fromEntries(
    Object.entries(raw).map(([kase, value]) => {
      const e = new Entry("numeral-frames.json", kase, isObject(value) ? value : {}, NUMERAL_FIELDS);
      if (!(CASES as readonly string[]).includes(kase)) e.fail(`is not a case: ${CASES.join(", ")}`);
      if (!isObject(value)) e.fail("needs an object");
      const tpl: NumeralTemplate = { pl: frameText(e, ["{NP}"]), en: e.text("en"), ...nounFilter(e, groups) };
      const review = e.review();
      if (review) tpl.review = review;
      return [kase, tpl];
    }),
  );
}

// ------------------------------------------------------------------ verbs

const VERB_FIELDS = ["en", "level", "freq", "impf", "pf", "objects", "reflexive", "motion", "indeterminate", "momentary", "stative", "orders", "review"];

function aspect(e: Entry, key: "impf" | "pf"): Verb["impf"] {
  const o = e.object(key);
  const part = new Entry(e.file, e.id, o, ["inf", "past", "pres", "imp"]);
  const pastObj = part.object(`${key}.past`, o.past);
  const past = new Entry(e.file, e.id, pastObj, ["m", "m1", "f", "vir"]);
  const pres = part.list(`${key}.pres`, o.pres);
  if (pres.length !== 3) e.fail(`needs 3 "${key}.pres" forms (1sg, 2sg, 3pl), got ${pres.length}`);
  return {
    inf: part.text(`${key}.inf`, o.inf),
    past: {
      m: past.text(`${key}.past.m`, pastObj.m),
      ...("m1" in pastObj ? { m1: past.text(`${key}.past.m1`, pastObj.m1) } : {}),
      f: past.text(`${key}.past.f`, pastObj.f),
      vir: past.text(`${key}.past.vir`, pastObj.vir),
    },
    pres: [pres[0], pres[1], pres[2]],
    ...("imp" in o ? { imp: part.text(`${key}.imp`, o.imp) } : {}),
  };
}

/**
 * The English gloss. A "be + adjective" base (be late, be afraid of) is
 * conjugated from "be" itself (am / was / will be), so it takes no `past` or
 * `ing`; every other base needs both.
 */
function englishGloss(e: Entry): Verb["en"] {
  const en = e.object("en");
  const gloss = new Entry(e.file, e.id, en, ["base", "past", "ing"]);
  const base = gloss.text("en.base", en.base);
  if (/^be /.test(base)) {
    if (gloss.has("past") || gloss.has("ing")) {
      e.fail(`has "be" in "en.base" ("${base}"): leave out "en.past" and "en.ing", they come from "be"`);
    }
    return { base };
  }
  return { base, past: gloss.text("en.past", en.past), ing: gloss.text("en.ing", en.ing) };
}

export function loadVerbs(raw: unknown): Verb[] {
  return entries("verbs.json", raw).map((o, i) => {
    const impf = isObject(o.impf) ? o.impf : {};
    const e = new Entry("verbs.json", label(impf, "inf", i), o, VERB_FIELDS);
    const objects = o.objects;
    if (!Array.isArray(objects) || objects.length === 0) return e.fail(`needs a non-empty list for "objects"`);
    const verb: Verb = {
      en: englishGloss(e),
      level: e.level(),
      impf: aspect(e, "impf"),
      // optional: imperfective-only verbs (chodzić, mieszkać, wiedzieć) have no partner
      ...(e.has("pf") ? { pf: aspect(e, "pf") } : {}),
      objects: objects.map((value) => {
        const obj = new Entry(e.file, e.id, e.object("objects[]", value), ["pl", "neg", "en"]);
        return {
          pl: obj.text("objects[].pl", obj.o.pl),
          ...(obj.has("neg") ? { neg: obj.text("objects[].neg", obj.o.neg) } : {}),
          en: obj.text("objects[].en", obj.o.en),
        };
      }),
    };
    const freq = e.freq();
    if (freq) verb.freq = freq;
    if (e.has("reflexive")) verb.reflexive = e.flag("reflexive", true) as true;
    if (e.has("motion")) verb.motion = e.flag("motion", true) as true;
    if (e.has("indeterminate")) verb.indeterminate = e.flag("indeterminate", true) as true;
    if (e.has("momentary")) verb.momentary = e.flag("momentary", true) as true;
    if (e.has("stative")) verb.stative = e.flag("stative", true) as true;
    if (verb.motion && verb.indeterminate) e.fail(`cannot be both "motion" (iść) and "indeterminate" (chodzić)`);
    if (verb.indeterminate && verb.pf) e.fail(`is "indeterminate" (chodzić, jeździć): it has no "pf"`);
    if (e.has("orders")) {
      verb.orders = e.oneOf("orders", ["affirmative", "negated"] as const);
      const imp = verb.orders === "negated" ? verb.impf.imp : (verb.pf?.imp ?? verb.impf.imp);
      if (!imp) e.fail(`has "orders": "${verb.orders}" but no imperative to give them with`);
    }
    const review = e.review();
    if (review) verb.review = review;
    return verb;
  });
}

// ------------------------------------------------------- the whole lexicon

/** The raw contents of every file in data/, as imported. */
export type LexiconData = {
  nouns: unknown;
  adjectives: unknown;
  collocations: unknown;
  groups: unknown;
  templates: unknown;
  verbs: unknown;
  agreement: unknown;
  counting: unknown;
  numerals: unknown;
};

/** Every word and frame the drills draw from, validated and typed. */
export type Lexicon = {
  nouns: Noun[];
  adjectives: Adjective[];
  collocations: Record<string, string[]>;
  templates: Template[];
  verbs: Verb[];
  /** data/agreement-frames.json: the demonstrative, possessive and ordinal frames. */
  agreement: Template[];
  /** data/count-frames.json */
  counting: CountTemplate[];
  /** data/numeral-frames.json */
  numerals: Partial<Record<Case, NumeralTemplate>>;
};

/** Loads and checks every file, drafts included. */
export function loadLexicon(data: LexiconData): Lexicon {
  const nouns = loadNouns(data.nouns);
  const adjectives = loadAdjectives(data.adjectives);
  const groups: Groups = {
    ...loadGroups(data.groups),
    /** Relatives need a possessive in English: "This is a husband" is no sentence. */
    relatives: nouns.filter((n) => n.tags.includes("family")).map((n) => n.lemma),
  };
  return {
    nouns,
    adjectives,
    collocations: loadCollocations(data.collocations, adjectives),
    templates: loadTemplates(data.templates, groups),
    verbs: loadVerbs(data.verbs),
    agreement: loadTemplates(data.agreement, groups, "agreement-frames.json"),
    counting: loadCountTemplates(data.counting, groups),
    numerals: loadNumeralTemplates(data.numerals, groups),
  };
}

// ------------------------------------------------------ published vs draft

export const isDraft = (entry: { review?: Review }): boolean => entry.review === "draft";

type Frame = Pick<Template, "requires" | "lemmas" | "excludeLemmas" | "adjOnly" | "review">;

/**
 * The lexicon a learner sees: every draft left out, and every reference to a
 * draft word with it, so nothing published names a word that is not there.
 * A frame that only named draft nouns (no tags, every `lemmas` entry a draft)
 * goes too; an `adjOnly` left empty means "no adjective", which still reads.
 * With no drafts the lexicon comes back entry for entry as it was.
 */
export function publish(lexicon: Lexicon): Lexicon {
  const draftNouns = new Set(lexicon.nouns.filter(isDraft).map((n) => n.lemma));
  const draftAdjectives = new Set(lexicon.adjectives.filter(isDraft).map((a) => a.lemma));
  const keepNoun = (lemma: string) => !draftNouns.has(lemma);
  const keepAdjective = (lemma: string) => !draftAdjectives.has(lemma);

  /** The frame without its draft references, or null when it is a draft or names nothing left. */
  function narrow<T extends Frame>(frame: T): T | null {
    if (isDraft(frame)) return null;
    const lemmas = frame.lemmas?.filter(keepNoun);
    const excludeLemmas = frame.excludeLemmas?.filter(keepNoun);
    const adjOnly = frame.adjOnly?.filter(keepAdjective);
    const unchanged = (a?: string[], b?: string[]) => a?.length === b?.length;
    if (unchanged(lemmas, frame.lemmas) && unchanged(excludeLemmas, frame.excludeLemmas) && unchanged(adjOnly, frame.adjOnly)) {
      return frame;
    }
    if (frame.requires.length === 0 && frame.lemmas?.length && !lemmas?.length) return null;
    const out: T = { ...frame };
    if (lemmas) out.lemmas = lemmas;
    if (excludeLemmas) out.excludeLemmas = excludeLemmas;
    if (adjOnly) out.adjOnly = adjOnly;
    return out;
  }
  const frames = <T extends Frame>(list: T[]): T[] => list.map(narrow).filter((t): t is T => t !== null);

  return {
    nouns: lexicon.nouns.filter((n) => !isDraft(n)),
    adjectives: lexicon.adjectives.filter((a) => !isDraft(a)),
    collocations: Object.fromEntries(
      Object.entries(lexicon.collocations)
        .filter(([noun]) => keepNoun(noun))
        .map(([noun, adjectives]) => [noun, adjectives.filter(keepAdjective)]),
    ),
    templates: frames(lexicon.templates),
    verbs: lexicon.verbs.filter((v) => !isDraft(v)),
    agreement: frames(lexicon.agreement),
    counting: frames(lexicon.counting),
    numerals: Object.fromEntries(
      Object.entries(lexicon.numerals).flatMap(([kase, frame]) => {
        const kept = frame && narrow(frame);
        return kept ? [[kase, kept]] : [];
      }),
    ),
  };
}
