import { buildSession, exampleExercise, nounForm, nounsFor } from "./generate";
import { buildNumberSession } from "./numbers";
import { NOUNS, nounVariants } from "./nouns";
import {
  GOVERNMENT_CELL,
  MONTHS,
  cardinal,
  countingNumeral,
  englishNumber,
  englishOrdinal,
  government,
  obliqueCardinal,
  ordinal,
  ordinalLemma,
} from "./numerals";
import { OWNER_INFO, buildPossessiveSession, declinePossessive } from "./possessives";
import { buildPronounSession, declineDemonstrative, type Demonstrative } from "./pronouns";
import { sessionParams } from "./session";
import { TEMPLATES } from "./templates";
import { CASES, LEVELS, POSSESSIVES, PRONOUN_CASES } from "./types";
import type {
  Case,
  Config,
  Exercise,
  Gender,
  GramNumber,
  Noun,
  NumberDrill,
  Possessive,
  Tense,
  Template,
} from "./types";
import {
  SUBJECTS,
  TENSE_LABEL,
  VERBS,
  buildVerbCard,
  buildVerbSession,
  futureCompound,
  imperative,
  nonPast,
  pastForm,
  withSie,
  type Person,
  type Verb,
} from "./verbs";

/**
 * The content of the reference pages (/polish-cases, /polish-pronouns,
 * /polish-numbers, /polish-verbs), computed at build time from the app's own
 * grammar code and the lexicon the build was made with: published only in a
 * production build. No Polish form is written here by hand, so every one is as
 * correct as the drills themselves. Choices are deterministic (file order, a
 * fixed seed), so a build is reproducible.
 */

// ------------------------------------------------------------------ shared

/** A Polish sentence split into the plain text and the drilled form. */
export type Example = {
  parts: { text: string; key: boolean }[];
  en: string;
  note: string;
};

/** The sentence with the answer filled in, the answer marked as the key part. */
export function toExample(ex: Exercise): Example {
  const parts: Example["parts"] = [];
  if (ex.before) parts.push({ text: ex.before, key: false });
  ex.tokens.forEach((t, i) => parts.push({ text: (i > 0 ? " " : "") + t.text, key: t.blank }));
  if (ex.after) parts.push({ text: ex.after, key: false });
  return { parts, en: ex.en, note: ex.note };
}

/** The plain sentence of an example. */
export const exampleText = (e: Example) => e.parts.map((p) => p.text).join("");

/** A configured /practice URL; the fixed seed keeps the page static. */
export function practiceHref(config: Omit<Config, "count"> & { count?: number }): string {
  return `/practice?${sessionParams({ count: 20, ...config }, 1)}`;
}

const freqOf = (n: { freq?: number }) => n.freq ?? 3;
const levelOf = (n: { level: string }) => LEVELS.indexOf(n.level as (typeof LEVELS)[number]);

/** Easiest, most common first; file order breaks ties. */
function byEase<T extends { level: string; freq?: number }>(items: T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => levelOf(a.item) - levelOf(b.item) || freqOf(a.item) - freqOf(b.item) || a.i - b.i)
    .map(({ item }) => item);
}

/** A noun from the lexicon by lemma; throws so a renamed model noun fails the build. */
export function lexiconNoun(lemma: string): Noun {
  const noun = NOUNS.find((n) => n.lemma === lemma);
  if (!noun) throw new Error(`guides: model noun "${lemma}" is not in the lexicon`);
  return noun;
}

// ------------------------------------------------------------------- cases

export const CASE_USES: Record<Case, string> = {
  nom: "The dictionary form. It names the subject, the one who does the action, and it is also the form after “this is”.",
  gen: "The busiest case after the nominative: possession (“of”), negation (a direct object turns genitive after a negated verb), amounts and quantities, and many common prepositions and verbs.",
  dat: "The receiver: who something is given, sent or said to, and who it is done for. A handful of everyday verbs (help, trust, thank) always take it.",
  acc: "The direct object of most verbs: what you see, have, buy or like. A few prepositions take it when they mean movement towards something or a purpose.",
  ins: "“With” and “by means of”: company, transport, a profession after “to be” or “to become”, and the position prepositions (above, under, in front of) when nothing moves.",
  loc: "Only ever after a preposition: “in”, “on”, “at”, “about”, “next to”. It marks where something is (not where it is going) and what you talk or think about.",
  voc: "Calling or addressing someone directly: names, family members, titles. In everyday speech many people use the nominative for first names; letters and formal address keep the vocative.",
};

/** The model nouns of the ending table, one per gender that changes endings. */
export const MODEL_NOUNS: { lemma: string; gender: string }[] = [
  { lemma: "student", gender: "masculine personal" },
  { lemma: "kot", gender: "masculine animate" },
  { lemma: "dom", gender: "masculine inanimate" },
  { lemma: "kobieta", gender: "feminine" },
  { lemma: "okno", gender: "neuter" },
];

export type EndingTable = {
  nouns: { lemma: string; en: string; gender: string }[];
  rows: { kase: Case; sg: string[]; pl: string[] }[];
};

/** Every case of the model nouns, alternatives joined with " / ". */
export function caseEndingTable(): EndingTable {
  const nouns = MODEL_NOUNS.map((m) => ({ ...m, noun: lexiconNoun(m.lemma) }));
  return {
    nouns: nouns.map(({ lemma, gender, noun }) => ({ lemma, en: noun.en, gender })),
    rows: CASES.map((kase) => ({
      kase,
      sg: nouns.map(({ noun }) => nounVariants(noun, "sg", kase).join(" / ")),
      pl: nouns.map(({ noun }) => (noun.pl ? nounVariants(noun, "pl", kase).join(" / ") : "—")),
    })),
  };
}

export type Trigger = { note: string; example: Example | null };

/**
 * What triggers a case: the rule line of every published sentence frame for
 * it (one per distinct rule, in file order), each with a sentence built from
 * the first frame that states it and the easiest noun that fits, a different
 * noun each time where possible.
 */
export function caseTriggers(kase: Case): Trigger[] {
  const byNote = new Map<string, Template[]>();
  for (const tpl of TEMPLATES) {
    if (tpl.case !== kase) continue;
    byNote.set(tpl.note, [...(byNote.get(tpl.note) ?? []), tpl]);
  }
  const used = new Set<string>();
  const out: Trigger[] = [];
  for (const [note, templates] of byNote) {
    let example: Example | null = null;
    for (const tpl of templates) {
      const number: GramNumber = tpl.number === "pl" ? "pl" : "sg";
      const nouns = byEase(nounsFor(tpl, number));
      // a noun whose form here differs from the nominative shows the case
      const shows = (n: Noun) => kase === "nom" || nounForm(n, number, kase) !== nounForm(n, number, "nom");
      const noun =
        nouns.find((n) => !used.has(n.lemma) && shows(n)) ??
        nouns.find((n) => !used.has(n.lemma)) ??
        nouns[0];
      if (!noun) continue;
      used.add(noun.lemma);
      example = toExample(exampleExercise(tpl, noun, number));
      break;
    }
    out.push({ note, example });
  }
  return out;
}

/** A session drilling one case, singular and plural. */
export const casePracticeHref = (kase: Case) =>
  practiceHref({ kind: "cases", cases: [kase], numbers: kase === "voc" ? ["sg"] : ["sg", "pl"], mode: "nouns" });

/** A few mixed sentences, nouns and adjectives together, for the page's closing examples. */
export function caseExamples(count = 6): Example[] {
  return buildSession(
    { kind: "cases", cases: [...CASES], numbers: ["sg", "pl"], mode: "both", count, maxLevel: "A2" },
    7,
  ).map(toExample);
}

// ---------------------------------------------------------------- pronouns

/** The gender columns of an agreement table: five in the singular, two in the plural. */
export const SG_COLUMNS: { gender: Gender; label: string }[] = [
  { gender: "mPers", label: "masc. personal" },
  { gender: "mAnim", label: "masc. animate" },
  { gender: "mInanim", label: "masc. inanimate" },
  { gender: "f", label: "feminine" },
  { gender: "n", label: "neuter" },
];

export const PL_COLUMNS: { gender: Gender; label: string }[] = [
  { gender: "mPers", label: "men (masc. personal)" },
  { gender: "f", label: "everything else" },
];

export type AgreementTable = { kase: Case; sg: string[]; pl: string[] }[];

function agreementTable(decline: (g: Gender, n: GramNumber, k: Case) => string): AgreementTable {
  return PRONOUN_CASES.map((kase) => ({
    kase,
    sg: SG_COLUMNS.map((c) => decline(c.gender, "sg", kase)),
    pl: PL_COLUMNS.map((c) => decline(c.gender, "pl", kase)),
  }));
}

export const demonstrativeTable = (base: Demonstrative) =>
  agreementTable((g, n, k) => declineDemonstrative(base, g, n, k));

export const possessiveTable = (owner: Possessive) =>
  agreementTable((g, n, k) => declinePossessive(owner, g, n, k));

/** Every possessive with who owns and the English, in the drill's order. */
export const possessiveOwners = () =>
  POSSESSIVES.map((p) => ({ key: p, ...OWNER_INFO[p] }));

export function pronounExamples(count = 4): Example[] {
  return buildPronounSession(
    { kind: "pronouns", cases: [...PRONOUN_CASES], numbers: ["sg", "pl"], mode: "nouns", count, maxLevel: "A2" },
    3,
  ).map(toExample);
}

export function possessiveExamples(count = 4): Example[] {
  return buildPossessiveSession(
    { kind: "possessives", cases: [...PRONOUN_CASES], numbers: ["sg", "pl"], mode: "nouns", count, maxLevel: "A2" },
    5,
  ).map(toExample);
}

export const pronounPracticeHref = () =>
  practiceHref({ kind: "pronouns", cases: [...PRONOUN_CASES], numbers: ["sg", "pl"], mode: "nouns" });

export const possessivePracticeHref = () =>
  practiceHref({ kind: "possessives", cases: [...PRONOUN_CASES], numbers: ["sg", "pl"], mode: "nouns" });

// ----------------------------------------------------------------- numbers

/** The nouns counted in the 1 / 2–4 / 5+ table: one per gender that counts differently. */
export const COUNTED_NOUNS = ["student", "kot", "kobieta", "okno"];
export const COUNTED_NUMBERS = [1, 2, 3, 4, 5, 11, 12, 21, 22, 25, 100];

export type CountTable = {
  nouns: { lemma: string; en: string }[];
  rows: { n: number; band: string; cells: string[] }[];
};

const BAND: Record<string, string> = {
  nomSg: "nominative singular",
  nomPl: "nominative plural",
  genPl: "genitive plural",
};

/** "dwa koty", "pięć kotów": numeral + noun in the case and number the numeral governs. */
export function countTable(): CountTable {
  const nouns = COUNTED_NOUNS.map(lexiconNoun);
  return {
    nouns: nouns.map((n) => ({ lemma: n.lemma, en: n.enPl })),
    rows: COUNTED_NUMBERS.map((n) => ({
      n,
      // the band of a non-personal noun; the personal column is explained beside the table
      band: BAND[government(n, "f")],
      cells: nouns.map((noun) => {
        const cell = GOVERNMENT_CELL[government(n, noun.gender)];
        return `${countingNumeral(n, noun.gender)} ${nounForm(noun, cell.number, cell.case)}`;
      }),
    })),
  };
}

/** 5 and its oblique form, the one most cases share from 5 up. */
export const obliqueExample = () => ({ base: cardinal(5), form: obliqueCardinal(5) });

export const CARDINALS = [
  ...Array.from({ length: 20 }, (_, i) => i + 1),
  30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 500, 1000, 2000, 5000,
];

export const cardinalTable = () => CARDINALS.map((n) => ({ n, pl: cardinal(n), en: englishNumber(n) }));

export const ORDINALS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 20, 21, 30, 100];

export const ordinalTable = () =>
  ORDINALS.map((n) => ({
    n,
    en: englishOrdinal(n),
    m: ordinalLemma(n),
    f: ordinal(n, "f", "sg", "nom"),
    neut: ordinal(n, "n", "sg", "nom"),
  }));

/** Dates are day (ordinal, genitive) + month (genitive): the same build as the date drill. */
export const DATES: [number, number][] = [
  [1, 0], [14, 1], [3, 4], [11, 10], [24, 11], [31, 11],
];

export const dateTable = () =>
  DATES.map(([day, month]) => ({
    en: `the ${englishOrdinal(day)} of ${MONTHS[month].en}`,
    pl: `${ordinal(day, "mInanim", "sg", "gen")} ${MONTHS[month].gen}`,
  }));

export const monthTable = () => MONTHS.map((m) => ({ en: m.en, nom: m.nom, gen: m.gen }));

/** The hour is a feminine ordinal: nominative for "it's …", locative for "at …". */
export const HOURS = [1, 2, 3, 5, 8, 12];

export const hourTable = () =>
  HOURS.map((h) => ({
    en: englishNumber(h),
    nom: ordinal(h, "f", "sg", "nom"),
    loc: ordinal(h, "f", "sg", "loc"),
  }));

export function numberExamples(drill: NumberDrill, count = 3, seed = 11): Example[] {
  return buildNumberSession(
    {
      kind: "numbers",
      cases: [...PRONOUN_CASES],
      numbers: ["sg"],
      mode: "nouns",
      drills: [drill],
      max: 100,
      count,
      maxLevel: "A2",
    },
    seed,
  ).map(toExample);
}

export const numberPracticeHref = (drills: NumberDrill[]) =>
  practiceHref({ kind: "numbers", cases: [...PRONOUN_CASES], numbers: ["sg"], mode: "nouns", drills, max: 100 });

// ------------------------------------------------------------------- verbs

/** The model verb of the conjugation tables. */
export const MODEL_VERB = "pisać";

export function lexiconVerb(inf: string): Verb {
  const verb = VERBS.find((v) => v.impf.inf === inf);
  if (!verb) throw new Error(`guides: model verb "${inf}" is not in the lexicon`);
  return verb;
}

/** The commonest aspect pairs, easiest first. */
export function aspectPairs(count = 14) {
  return byEase(VERBS.filter((v) => v.pf && !v.reflexive))
    .slice(0, count)
    .map((v) => ({ impf: v.impf.inf, pf: v.pf!.inf, en: v.en.base }));
}

/** Verbs with no perfective partner (being somewhere, going regularly…). */
export function imperfectiveOnly(count = 6) {
  return byEase(VERBS.filter((v) => !v.pf && !v.reflexive))
    .slice(0, count)
    .map((v) => ({ inf: v.impf.inf, en: v.en.base }));
}

/** The pronouns that head each of the six person rows: "on / ona", "oni / one". */
function personLabel(person: Person, number: GramNumber): string {
  return [...new Set(SUBJECTS.filter((s) => s.person === person && s.number === number).map((s) => s.pl))].join(" / ");
}

const PERSONS: { person: Person; number: GramNumber }[] = [
  { person: 1, number: "sg" },
  { person: 2, number: "sg" },
  { person: 3, number: "sg" },
  { person: 1, number: "pl" },
  { person: 2, number: "pl" },
  { person: 3, number: "pl" },
];

export type Conjugation = {
  impf: string;
  pf: string;
  en: string;
  /** Present (imperfective) and simple future (perfective), by person. */
  nonPast: { who: string; present: string; future: string; compound: string[] }[];
  /** Past of both aspects, by subject (the ending shows gender). */
  past: { who: string; impf: string; pf: string }[];
  imperative: { who: string; impf: string; pf: string }[];
};

export function conjugation(inf = MODEL_VERB): Conjugation {
  const verb = lexiconVerb(inf);
  const pf = verb.pf;
  if (!pf) throw new Error(`guides: model verb "${inf}" needs a perfective`);
  return {
    impf: verb.impf.inf,
    pf: pf.inf,
    en: verb.en.base,
    nonPast: PERSONS.map(({ person, number }) => {
      // the będę + -ł future marks gender: one row each for the masculine and feminine subject
      const subjects = SUBJECTS.filter((s) => s.person === person && s.number === number);
      const compound = [
        ...new Set([
          futureCompound(verb.impf, person, number, subjects[0].gender)[0],
          ...subjects.map((s) => futureCompound(verb.impf, person, number, s.gender)[1]),
        ]),
      ];
      return {
        who: personLabel(person, number),
        present: nonPast(verb.impf, person, number),
        future: nonPast(pf, person, number),
        compound,
      };
    }),
    past: SUBJECTS.map((s) => ({
      who: s.label,
      impf: pastForm(verb.impf, s.person, s.gender),
      pf: pastForm(pf, s.person, s.gender),
    })),
    imperative: PERSONS.flatMap(({ person, number }) => {
      const a = imperative(verb.impf, person, number);
      const b = imperative(pf, person, number);
      return a && b ? [{ who: personLabel(person, number), impf: a, pf: b }] : [];
    }),
  };
}

/** One sentence per verb in this tense, from the drill's own builder. */
export function verbExamples(tense: Tense, verbs: string[]): Example[] {
  return verbs
    .map((inf) => buildVerbCard(inf, tense, 13))
    .filter((e): e is Exercise => e !== null)
    .map(toExample);
}

export const verbPracticeHref = (tenses: Tense[]) =>
  practiceHref({ kind: "verbs", tenses, cases: ["nom"], numbers: ["sg", "pl"], mode: "nouns" });

export { TENSE_LABEL };

// ----------------------------------------------------------------- landing

/**
 * The landing page's sample questions: one case, one verb and one number
 * question in multiple choice, fixed seeds so the page is static. `source`
 * (the whole noun entry) is dropped: the client only needs what it shows.
 */
export function sampleQuestions(): Exercise[] {
  const take = (list: Exercise[]): Exercise[] => {
    const ex = list.find((e) => e.options && e.options.length > 1);
    if (!ex) return [];
    const { source: _source, ...rest } = ex;
    void _source;
    return [rest];
  };
  return [
    ...take(
      buildSession(
        { kind: "cases", cases: ["gen"], numbers: ["sg"], mode: "nouns", count: 1, answerMode: "choice", maxLevel: "A1" },
        8,
      ),
    ),
    ...take(
      buildVerbSession(
        {
          kind: "verbs",
          tenses: ["past"],
          verbType: "plain",
          cases: ["nom"],
          numbers: ["sg"],
          mode: "nouns",
          count: 1,
          answerMode: "choice",
          maxLevel: "A1",
        },
        4,
      ),
    ),
    ...take(
      buildNumberSession(
        {
          kind: "numbers",
          cases: ["nom", "acc"],
          numbers: ["sg"],
          mode: "nouns",
          drills: ["count"],
          count: 1,
          answerMode: "choice",
          maxLevel: "A1",
        },
        9,
      ),
    ),
  ];
}

/** A reflexive verb in three forms, "się" placed by the drill's own rule. */
export function reflexiveSample(inf = "uczyć się") {
  const verb = lexiconVerb(inf);
  return {
    inf: verb.impf.inf,
    en: verb.en.base,
    forms: [
      withSie(verb, nonPast(verb.impf, 1, "sg"))[0],
      withSie(verb, pastForm(verb.impf, 3, "f"))[0],
      withSie(verb, futureCompound(verb.impf, 1, "pl", "vir")[0])[0],
    ],
  };
}
