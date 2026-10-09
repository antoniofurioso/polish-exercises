import { ADJ_TYPES, CASES, GENDERS, TAGS } from "./types";
import type { Adjective, Forms, Noun, Tag, Template } from "./types";
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

const NOUN_FIELDS = ["lemma", "en", "enPl", "gender", "tags", "sg", "pl", "mass", "noPlural", "onlySg", "alt"];

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
      gender: e.oneOf("gender", GENDERS),
      tags: e.list("tags").map((t) => e.oneOf<Tag>("tag", TAGS, t)),
      sg: forms(e, "sg"),
    };
    if (e.has("pl")) noun.pl = forms(e, "pl");
    if (e.has("mass")) noun.mass = e.flag("mass");
    if (e.has("noPlural")) noun.noPlural = e.flag("noPlural");
    if (e.has("onlySg")) noun.onlySg = e.flag("onlySg");
    if (noun.noPlural ? noun.pl : !noun.pl) e.fail(`needs "pl" forms unless it is marked "noPlural"`);
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
    return noun;
  });
}

// ------------------------------------------------------------- adjectives

const ADJECTIVE_FIELDS = ["lemma", "en", "stem", "type", "virilePl", "state", "address"];

export function loadAdjectives(raw: unknown): Adjective[] {
  return entries("adjectives.json", raw).map((o, i) => {
    const e = new Entry("adjectives.json", label(o, "lemma", i), o, ADJECTIVE_FIELDS);
    const adj: Adjective = {
      lemma: e.text("lemma"),
      en: e.text("en"),
      stem: e.text("stem"),
      type: e.oneOf("type", ADJ_TYPES),
      virilePl: e.text("virilePl"),
    };
    if (!adj.lemma.startsWith(adj.stem)) e.fail(`has a stem "${adj.stem}" that does not start the lemma`);
    if (e.has("state")) adj.state = e.flag("state");
    if (e.has("address")) adj.address = e.flag("address");
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

export function loadTemplates(raw: unknown, groups: Groups): Template[] {
  return entries("templates.json", raw).map((o, i) => {
    const e = new Entry("templates.json", label(o, "pl", i), o, TEMPLATE_FIELDS);
    const tpl: Template = {
      case: e.oneOf("case", CASES),
      number: e.oneOf("number", ["sg", "pl", "any"] as const),
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
    return tpl;
  });
}

// ------------------------------------------------------------------ verbs

const VERB_FIELDS = ["en", "impf", "pf", "objects", "reflexive", "motion", "momentary"];

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

export function loadVerbs(raw: unknown): Verb[] {
  return entries("verbs.json", raw).map((o, i) => {
    const impf = isObject(o.impf) ? o.impf : {};
    const e = new Entry("verbs.json", label(impf, "inf", i), o, VERB_FIELDS);
    const en = e.object("en");
    const gloss = new Entry(e.file, e.id, en, ["base", "past", "ing"]);
    const objects = o.objects;
    if (!Array.isArray(objects) || objects.length === 0) return e.fail(`needs a non-empty list for "objects"`);
    const verb: Verb = {
      en: { base: gloss.text("en.base", en.base), past: gloss.text("en.past", en.past), ing: gloss.text("en.ing", en.ing) },
      impf: aspect(e, "impf"),
      pf: aspect(e, "pf"),
      objects: objects.map((value) => {
        const obj = new Entry(e.file, e.id, e.object("objects[]", value), ["pl", "neg", "en"]);
        return {
          pl: obj.text("objects[].pl", obj.o.pl),
          ...(obj.has("neg") ? { neg: obj.text("objects[].neg", obj.o.neg) } : {}),
          en: obj.text("objects[].en", obj.o.en),
        };
      }),
    };
    if (e.has("reflexive")) verb.reflexive = e.flag("reflexive", true) as true;
    if (e.has("motion")) verb.motion = e.flag("motion", true) as true;
    if (e.has("momentary")) verb.momentary = e.flag("momentary", true) as true;
    return verb;
  });
}
