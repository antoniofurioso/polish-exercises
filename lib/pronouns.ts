import { CASE_INFO } from "./cases";
import {
  capitalise,
  makeRng,
  nounForm,
  nounsFor,
  pick,
  shuffle,
} from "./generate";
import { normalise, stripDiacritics } from "./grade";
import { PRONOUN_CASES, genderGroup } from "./types";
import type {
  AnswerMode,
  Case,
  Config,
  Exercise,
  Gender,
  GenderGroup,
  GramNumber,
  Noun,
  Template,
  Token,
} from "./types";

/**
 * The demonstrative-pronoun drill: the noun is shown already declined into the
 * target case, and the blank is the demonstrative (ten / tamten) that has to
 * agree with it in gender, number and case.
 */

export const DEMONSTRATIVES = ["ten", "tamten"] as const;
export type Demonstrative = (typeof DEMONSTRATIVES)[number];

const GENDER_WORD: Record<GenderGroup, string> = {
  m: "masculine",
  f: "feminine",
  n: "neuter",
};

const DETERMINER: Record<Demonstrative, [string, string]> = {
  ten: ["this", "these"],
  tamten: ["that", "those"],
};

/**
 * The full paradigm of "ten". Masculine singular accusative copies the
 * nominative for inanimates and the genitive for animates; the plural splits
 * masculine-personal ("ci") from everything else ("te").
 */
function declineTen(gender: Gender, number: GramNumber, kase: Case): string {
  // every branch below is exhaustive over Case; the annotation keeps callers typed
  if (number === "pl") {
    const virile = gender === "mPers";
    switch (kase) {
      case "nom":
      case "voc":
        return virile ? "ci" : "te";
      case "acc":
        return virile ? "tych" : "te";
      case "gen":
      case "loc":
        return "tych";
      case "dat":
        return "tym";
      case "ins":
        return "tymi";
    }
  }

  if (gender === "f") {
    switch (kase) {
      case "nom":
      case "voc":
        return "ta";
      case "gen":
      case "dat":
      case "loc":
        return "tej";
      case "acc":
        return "tę";
      case "ins":
        return "tą";
    }
  }

  if (gender === "n") {
    switch (kase) {
      case "nom":
      case "acc":
      case "voc":
        return "to";
      case "gen":
        return "tego";
      case "dat":
        return "temu";
      case "ins":
      case "loc":
        return "tym";
    }
  }

  // masculine singular
  switch (kase) {
    case "nom":
    case "voc":
      return "ten";
    case "gen":
      return "tego";
    case "dat":
      return "temu";
    case "acc":
      return gender === "mInanim" ? "ten" : "tego";
    case "ins":
    case "loc":
      return "tym";
  }
}

/**
 * "tamten" is "ten" with a tam- prefix in every cell, except the feminine
 * accusative, where the irregular "tę" gives way to the regular "tamtą".
 */
export function declineDemonstrative(
  base: Demonstrative,
  gender: Gender,
  number: GramNumber,
  kase: Case,
): string {
  const ten = declineTen(gender, number, kase);
  if (base === "ten") return ten;
  if (ten === "tę") return "tamtą";
  return "tam" + ten;
}

/**
 * A handful of simple sentence frames, one trigger per case, kept plain so the
 * only thing being tested is the agreement of the demonstrative.
 */
const PRONOUN_TEMPLATES: Template[] = [
  { case: "nom", number: "sg", pl: "Tu jest {NP}.", en: "{np} is here.",
    requires: [], note: "The subject of the sentence stays in the nominative." },
  { case: "nom", number: "pl", pl: "Tu są {NP}.", en: "{np} are here.",
    requires: [], note: "The subject of the sentence stays in the nominative." },
  { case: "gen", number: "any", pl: "Nie ma tu {NP}.", en: "{np} isn't here.",
    enPl: "{np} aren't here.", requires: [], note: "'nie ma' (there isn't) takes the genitive." },
  { case: "dat", number: "any", pl: "Przyglądam się {NP}.", en: "I'm looking at {np}.",
    requires: [], note: "'przyglądać się' takes the dative." },
  { case: "acc", number: "any", pl: "Widzę {NP}.", en: "I can see {np}.",
    requires: [], note: "A direct object takes the accusative." },
  { case: "ins", number: "any", pl: "Interesuję się {NP}.", en: "I'm interested in {np}.",
    requires: [], note: "'interesować się' takes the instrumental." },
  { case: "loc", number: "any", pl: "Myślę o {NP}.", en: "I'm thinking about {np}.",
    requires: [], note: "'o' (about) takes the locative." },
];

function templatesFor(kase: Case, number: GramNumber): Template[] {
  return PRONOUN_TEMPLATES.filter(
    (t) => t.case === kase && (t.number === "any" || t.number === number),
  );
}

function renderEnglish(
  tpl: Template,
  noun: Noun,
  base: Demonstrative,
  number: GramNumber,
): string {
  const head = number === "pl" ? noun.enPl : noun.en;
  const np = `${DETERMINER[base][number === "pl" ? 1 : 0]} ${head}`;
  const text = (tpl.enPl && number === "pl" ? tpl.enPl : tpl.en)
    .replace(/\{npDef\}/g, np)
    .replace(/\{npBare\}/g, np)
    .replace(/\{np\}/g, np);
  return capitalise(text);
}

function note(
  base: Demonstrative,
  noun: Noun,
  number: GramNumber,
  kase: Case,
  trigger: string,
): string {
  const group = genderGroup(noun.gender);
  const num = number === "pl" ? "plural" : "singular";
  const head = `"${base}" agrees with ${noun.lemma}: ${GENDER_WORD[group]} ${num}, ${CASE_INFO[
    kase
  ].en.toLowerCase()}. ${trigger}`;

  if (kase === "acc" && number === "sg") {
    if (noun.gender === "mInanim") {
      return `${head} Inanimate masculine — the accusative copies the nominative.`;
    }
    if (noun.gender === "mAnim" || noun.gender === "mPers") {
      return `${head} Animate masculine — the accusative copies the genitive.`;
    }
    if (noun.gender === "f") {
      return `${head} The feminine accusative is the special form "${
        base === "ten" ? "tę" : "tamtą"
      }".`;
    }
  }
  if (kase === "acc" && number === "pl" && noun.gender === "mPers") {
    return `${head} Masculine-personal plural — the accusative copies the genitive ("${
      base === "ten" ? "tych" : "tamtych"
    }").`;
  }
  return head;
}

export function buildPronounExercise(
  base: Demonstrative,
  kase: Case,
  numbers: GramNumber[],
  answerMode: AnswerMode,
  rng: () => number,
  taken: Set<string> = new Set(),
  genders?: GenderGroup[],
): Exercise | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const number = pick(numbers, rng);
    const templates = templatesFor(kase, number);
    if (templates.length === 0) continue;

    for (const tpl of shuffle(templates, rng)) {
      const nouns = nounsFor(tpl, number, genders);
      for (const noun of shuffle(nouns, rng)) {
        const key = `${base}|${tpl.pl}|${noun.lemma}|${number}`;
        if (taken.has(key) && attempt < 30) continue;
        taken.add(key);

        const demo = declineDemonstrative(base, noun.gender, number, kase);
        const nounText = nounForm(noun, number, kase);
        const [before, after] = tpl.pl.split("{NP}");
        const tokens: Token[] = [
          { text: demo, blank: true },
          { text: nounText, blank: false },
        ];

        const answers = [demo];
        if (base === "ten" && noun.gender === "f" && number === "sg" && kase === "acc") {
          answers.push("tą"); // colloquial but widely accepted
        }

        const exercise: Exercise = {
          id: `${key}|${kase}`,
          case: kase,
          number,
          before,
          after,
          tokens,
          hint: `${noun.lemma} · ${GENDER_WORD[genderGroup(noun.gender)]}`,
          en: renderEnglish(tpl, noun, base, number),
          answers,
          note: note(base, noun, number, kase, tpl.note),
        };

        if (answerMode === "choice") {
          const options = buildPronounOptions(base, noun.gender, number, kase, answers, rng);
          if (options.length > 1) exercise.options = options;
        }

        return exercise;
      }
    }
  }
  return null;
}

/**
 * Multiple-choice distractors: the same demonstrative in other cells of its own
 * paradigm, same-number cells first. Returns [] when the paradigm is too
 * syncretic to offer a real choice.
 */
export function buildPronounOptions(
  base: Demonstrative,
  gender: Gender,
  number: GramNumber,
  kase: Case,
  answers: string[],
  rng: () => number,
  count = 4,
): string[] {
  const correct = answers[0];
  const taken = new Set(answers.map((a) => stripDiacritics(normalise(a))));
  const near: string[] = [];
  const far: string[] = [];

  for (const num of ["sg", "pl"] as GramNumber[]) {
    for (const k of PRONOUN_CASES) {
      if (num === number && k === kase) continue;
      const text = declineDemonstrative(base, gender, num, k);
      const label = stripDiacritics(normalise(text));
      if (taken.has(label)) continue;
      taken.add(label);
      (num === number ? near : far).push(text);
    }
  }

  const distractors = [...shuffle(near, rng), ...shuffle(far, rng)].slice(0, count - 1);
  if (distractors.length < 1) return [];
  return shuffle([correct, ...distractors], rng);
}

/** Builds a full pronoun session, spreading the selected cases evenly. */
export function buildPronounSession(config: Config, seed = Date.now()): Exercise[] {
  const rng = makeRng(seed);
  const selected = (config.cases.length ? config.cases : (["nom"] as Case[])).filter(
    (c): c is Case => (PRONOUN_CASES as readonly string[]).includes(c),
  );
  const cases = selected.length ? selected : (["nom"] as Case[]);
  const numbers = config.numbers.length ? config.numbers : (["sg"] as GramNumber[]);
  const bases: Demonstrative[] =
    config.demo === "ten" ? ["ten"] : config.demo === "tamten" ? ["tamten"] : [...DEMONSTRATIVES];
  const answerMode: AnswerMode = config.answerMode === "choice" ? "choice" : "typing";

  const taken = new Set<string>();
  const exercises: Exercise[] = [];
  let pool: Case[] = [];
  for (let i = 0; i < config.count; i++) {
    if (pool.length === 0) pool = shuffle(cases, rng);
    const kase = pool.pop()!;
    const base = pick(bases, rng);
    const exercise = buildPronounExercise(base, kase, numbers, answerMode, rng, taken, config.genders);
    if (exercise) exercises.push(exercise);
  }
  return exercises;
}
