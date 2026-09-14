import {
  GENDER_WORD,
  agreementTemplatesFor,
  buildAgreementOptions,
  renderAgreementEnglish,
} from "./agreement";
import { CASE_INFO } from "./cases";
import { makeRng, nounForm, nounsFor, pick, shuffle } from "./generate";
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
  Token,
} from "./types";

/**
 * The demonstrative-pronoun drill: the noun is shown already declined into the
 * target case, and the blank is the demonstrative (ten / tamten) that has to
 * agree with it in gender, number and case.
 */

export const DEMONSTRATIVES = ["ten", "tamten"] as const;
export type Demonstrative = (typeof DEMONSTRATIVES)[number];

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
    const templates = agreementTemplatesFor(kase, number);
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
          en: renderAgreementEnglish(tpl, noun, DETERMINER[base][number === "pl" ? 1 : 0], number),
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

/** Multiple-choice distractors drawn from the demonstrative's own paradigm. */
export function buildPronounOptions(
  base: Demonstrative,
  gender: Gender,
  number: GramNumber,
  kase: Case,
  answers: string[],
  rng: () => number,
  count = 4,
): string[] {
  return buildAgreementOptions(
    (g, n, k) => declineDemonstrative(base, g, n, k),
    gender,
    number,
    kase,
    answers,
    rng,
    count,
  );
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
