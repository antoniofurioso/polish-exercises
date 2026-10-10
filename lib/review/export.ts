import { declineAdjective } from "../declineAdjective";
import type { AdjectiveStem } from "../declineAdjective";
import { renderSolution } from "../generate";
import { DRILLS } from "../drills";
import { CASES } from "../types";
import type { Case, Config, DrillKind, Exercise, Gender, GramNumber } from "../types";
import { toCsv } from "./csv";
import { drafts } from "./entries";
import type { DataFiles, Located, Obj } from "./entries";

/**
 * Builds review/pending.csv: one row per draft, with everything a native
 * speaker needs to judge it in a spreadsheet — the forms, written out, and
 * sentences the real generator builds with it, answers filled in.
 *
 * The examples come from the lexicon lib/lexicon.ts exports, so the caller
 * (scripts/review-export.ts) sets NEXT_PUBLIC_INCLUDE_DRAFTS=1 before this
 * module loads; without it no draft would ever turn up in a sentence.
 */

export const COLUMNS = [
  "kind",
  "id",
  "file",
  "level",
  "freq",
  "en",
  "forms",
  "example1",
  "example2",
  "example3",
  "verdict",
  "correction",
] as const;

const EXAMPLES = 3;
/** Sessions generated per drill setting to find sentences in; fixed seeds keep the sheet stable. */
const SEEDS = 300;
/** Seeds tried further, only for an entry the first SEEDS sessions never used (a rare adjective). */
const MORE_SEEDS = 3000;

// ------------------------------------------------------------------- forms

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const list = (v: unknown) => (Array.isArray(v) ? v.map(str).join(", ") : "");
const row = (label: string, forms: string[]) =>
  `${label}: ${CASES.map((c, i) => `${c}=${forms[i] ?? "?"}`).join(" ")}`;
const flags = (entry: Obj, names: string[]) => names.filter((n) => entry[n] === true);

function nounForms(n: Obj): string[] {
  const lines = [`gender: ${str(n.gender)} · tags: ${list(n.tags) || "none"}`];
  lines.push(row("sg", n.sg as string[]));
  lines.push(n.pl ? row("pl", n.pl as string[]) : "pl: none (noPlural)");
  const alt = (n.alt ?? {}) as Record<string, string[]>;
  const alts = Object.entries(alt).map(([cell, values]) => `${cell}=${values.join("/")}`);
  if (alts.length) lines.push(`also accepted: ${alts.join(" ")}`);
  const marks = flags(n, ["mass", "portions", "onlySg", "noPossessive"]);
  if (n.article) marks.push(`English article: ${str(n.article)}`);
  if (marks.length) lines.push(marks.join(", "));
  return lines;
}

function adjectiveForms(a: Obj): string[] {
  const adj = a as unknown as AdjectiveStem;
  const cells = (gender: Gender, number: GramNumber) =>
    CASES.map((c: Case) => declineAdjective(adj, gender, number, c));
  const masc = cells("mAnim", "sg");
  const inanimAcc = declineAdjective(adj, "mInanim", "sg", "acc");
  if (inanimAcc !== masc[3]) masc[3] = `${masc[3]} (inanimate: ${inanimAcc})`;
  const lines = [
    `stem: ${str(a.stem)} · type: ${str(a.type)} · virilePl: ${str(a.virilePl)}`,
    row("m sg", masc),
    row("f sg", cells("f", "sg")),
    row("n sg", cells("n", "sg")),
    row("pl men", cells("mPers", "pl")),
    row("pl other", cells("f", "pl")),
  ];
  const marks = flags(a, ["state", "address"]);
  if (marks.length) lines.push(marks.join(", "));
  return lines;
}

function verbForms(v: Obj): string[] {
  const aspect = (name: string, o: Obj) => {
    const past = (o.past ?? {}) as Obj;
    const parts = [
      `pres ${list(o.pres)}`,
      `past ${[past.m, past.m1 && `(1sg stem ${str(past.m1)})`, past.f, past.vir].filter(Boolean).map(str).join(", ")}`,
      o.imp ? `imp ${str(o.imp)}` : "no imperative",
    ];
    return `${name} ${str(o.inf)}: ${parts.join(" · ")}`;
  };
  const objects = ((v.objects ?? []) as Obj[]).map(
    (o) => `${str(o.pl)}${o.neg ? ` (neg ${str(o.neg)})` : ""} = ${str(o.en)}`,
  );
  const lines = [
    aspect("impf", v.impf as Obj),
    v.pf ? aspect("pf", v.pf as Obj) : "pf: none (imperfective only)",
    `objects: ${objects.join("; ")}`,
  ];
  const marks = flags(v, ["reflexive", "motion", "indeterminate", "momentary", "stative"]);
  if (v.orders) marks.push(`orders: ${str(v.orders)} only`);
  if (marks.length) lines.push(marks.join(", "));
  return lines;
}

/** A frame's fields as written in its file, "@groups" and all. */
function frameForms(f: Obj): string[] {
  const skip = new Set(["pl", "en", "level", "review", "note"]);
  const lines = Object.entries(f)
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${list(v)}]` : str(v)}`);
  if (f.note) lines.push(`note: ${str(f.note)}`);
  return lines;
}

/** Every form of the entry, one line per paradigm row or field. */
export function describeForms(d: Located): string {
  const e = d.entry;
  const lines =
    d.kind === "noun" ? nounForms(e)
      : d.kind === "adjective" ? adjectiveForms(e)
        : d.kind === "verb" ? verbForms(e)
          : frameForms(e);
  return lines.join("\n");
}

function english(d: Located): string {
  const e = d.entry;
  if (d.kind === "noun") return `${str(e.en)} / ${str(e.enPl)}`;
  if (d.kind === "verb") {
    const en = (e.en ?? {}) as Obj;
    // a "be late" base has no past / -ing of its own: "be" is conjugated
    return en.past === undefined ? str(en.base) : `${str(en.base)} / ${str(en.past)} / ${str(en.ing)}`;
  }
  if (e.enPl) return `${str(e.en)} | pl: ${str(e.enPl)}`;
  return str(e.en);
}

// ---------------------------------------------------------------- examples

/** Exercises from sessions `from`..`to` of one drill setting, built the first time they are needed. */
function pool(config: Config, from: number, to: number): () => Exercise[] {
  let cache: Exercise[] | undefined;
  return () => {
    if (!cache) {
      const build = DRILLS[config.kind ?? "cases"].build;
      cache = [];
      for (let seed = from; seed <= to; seed++) cache.push(...build(config, seed));
    }
    return cache;
  };
}

const base = (kind: DrillKind): Config => ({ ...DRILLS[kind].mix, count: 30 });
const pools = (from: number, to: number) => ({
  nouns: pool({ ...base("cases"), mode: "nouns" }, from, to),
  both: pool(base("cases"), from, to),
  adjectives: pool({ ...base("cases"), mode: "adjectives" }, from, to),
  pronouns: pool(base("pronouns"), from, to),
  possessives: pool(base("possessives"), from, to),
  count: pool({ ...base("numbers"), drills: ["count"] }, from, to),
  numeral: pool({ ...base("numbers"), drills: ["numeral"] }, from, to),
  ordinal: pool({ ...base("numbers"), drills: ["ordinal"] }, from, to),
  verbs: pool(base("verbs"), from, to),
});
type Pools = ReturnType<typeof pools>;
const POOLS = pools(1, SEEDS);
const MORE_POOLS = pools(SEEDS + 1, MORE_SEEDS);

const parts = (ex: Exercise) => ex.id.split("|");
const fitsNumber = (e: Obj, ex: Exercise) => e.number === "any" || e.number === ex.number;

/** The sentences that use the entry, drawn from the pools in order, best first. */
function candidates(d: Located, POOLS: Pools): Exercise[] {
  const e = d.entry;
  const pick = (pools: (() => Exercise[])[], match: (ex: Exercise) => boolean) =>
    pools.flatMap((p) => p().filter(match));

  switch (d.kind) {
    case "noun":
      return pick([POOLS.nouns, POOLS.both, POOLS.count], (ex) => ex.source?.noun.lemma === e.lemma);
    case "adjective":
      return pick([POOLS.both, POOLS.adjectives], (ex) => ex.source?.adj?.lemma === e.lemma);
    case "template":
      return pick(
        [POOLS.nouns, POOLS.both],
        (ex) => parts(ex)[0] === e.pl && ex.case === e.case && fitsNumber(e, ex),
      );
    case "agreement-frame":
      return pick(
        [POOLS.pronouns, POOLS.possessives, POOLS.ordinal],
        (ex) => parts(ex).includes(e.pl as string) && ex.case === e.case && fitsNumber(e, ex),
      );
    case "count-frame":
      return pick([POOLS.count], (ex) => parts(ex)[0] === "count" && parts(ex)[3] === e.pl);
    case "numeral-frame":
      return pick([POOLS.numeral], (ex) => parts(ex)[0] === "numeral" && parts(ex)[3] === d.key);
    case "verb": {
      const infs = [(e.impf as Obj).inf, (e.pf as Obj | undefined)?.inf].filter((inf) => inf !== undefined);
      const reflexive = e.reflexive === true;
      const all = pick(
        [POOLS.verbs],
        (ex) => infs.includes(parts(ex)[1]) && renderSolution(ex).includes("się") === reflexive,
      );
      // one per tense: present, past, future first, then the rest
      const order = ["present", "past", "future", "compound", "imp"];
      const firsts = order.map((t) => all.find((ex) => parts(ex)[0] === t)).filter((ex) => ex !== undefined);
      return [...firsts, ...all];
    }
  }
}

/** Up to three different sentences with the entry, answer filled in, English after. */
export function examplesFor(d: Located): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const found = candidates(d, POOLS);
  for (const ex of found.length > 0 ? found : candidates(d, MORE_POOLS)) {
    const text = `${renderSolution(ex)} — ${ex.en}`;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length === EXAMPLES) break;
  }
  return out;
}

// ------------------------------------------------------------------- sheet

/** The sheet's rows, header first. */
export function reviewRows(files: DataFiles): string[][] {
  const rows = drafts(files).map((d) => {
    const examples = examplesFor(d);
    if (examples.length === 0) examples.push("(no sentence uses it yet)");
    return [
      d.kind,
      d.id,
      `data/${d.file}`,
      str(d.entry.level),
      str(d.entry.freq),
      english(d),
      describeForms(d),
      ...Array.from({ length: EXAMPLES }, (_, i) => examples[i] ?? ""),
      "",
      "",
    ];
  });
  return [[...COLUMNS], ...rows];
}

/** review/pending.csv as text. */
export function reviewSheet(files: DataFiles): string {
  return toCsv(reviewRows(files));
}
