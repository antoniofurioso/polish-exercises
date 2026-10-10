import {
  GENDER_WORD,
  agreementTemplatesFor,
  buildAgreementOptions,
  renderAgreementEnglish,
} from "./agreement";
import { CASE_INFO } from "./cases";
import { casesWithin, makeRng, nounForm, nounsFor, pick, shuffle } from "./generate";
import { POSSESSIVE_CASES, POSSESSIVES, genderGroup } from "./types";
import type {
  AnswerMode,
  Case,
  Config,
  Exercise,
  Gender,
  GenderGroup,
  GramNumber,
  Level,
  Noun,
  Possessive,
  Template,
  Token,
} from "./types";

/**
 * The possessive drill: the noun is shown already declined into the target
 * case, and the blank is the possessive (mój, nasz, jego...) that has to agree
 * with it — or, for jego / jej / ich, stay stubbornly unchanged.
 */

type Family = "moj" | "nasz" | "fixed";

export const OWNER_INFO: Record<
  Possessive,
  { lemma: string; en: string; who: string; family: Family }
> = {
  moj: { lemma: "mój", en: "my", who: "ja", family: "moj" },
  twoj: { lemma: "twój", en: "your", who: "ty", family: "moj" },
  jego: { lemma: "jego", en: "his", who: "on / ono", family: "fixed" },
  jej: { lemma: "jej", en: "her", who: "ona", family: "fixed" },
  nasz: { lemma: "nasz", en: "our", who: "my", family: "nasz" },
  wasz: { lemma: "wasz", en: "your", who: "wy", family: "nasz" },
  ich: { lemma: "ich", en: "their", who: "oni / one", family: "fixed" },
  swoj: { lemma: "swój", en: "my own", who: "the subject", family: "moj" },
};

/** mój, twój and swój share one paradigm; only the bare stem changes. */
const BARE_STEM: Record<"moj" | "twoj" | "swoj", string> = {
  moj: "m",
  twoj: "tw",
  swoj: "sw",
};

/**
 * Endings of the mój paradigm, hung off the bare stem. Every cell but the
 * masculine nominative opens with -o: m + ój, m + ojego, m + oim.
 */
function mojEnding(gender: Gender, number: GramNumber, kase: Case): string {
  if (number === "pl") {
    const virile = gender === "mPers";
    switch (kase) {
      case "nom":
      case "voc":
        return virile ? "oi" : "oje";
      case "acc":
        return virile ? "oich" : "oje";
      case "gen":
      case "loc":
        return "oich";
      case "dat":
        return "oim";
      case "ins":
        return "oimi";
    }
  }

  if (gender === "f") {
    switch (kase) {
      case "nom":
      case "voc":
        return "oja";
      case "gen":
      case "dat":
      case "loc":
        return "ojej";
      case "acc":
      case "ins":
        return "oją";
    }
  }

  if (gender === "n") {
    switch (kase) {
      case "nom":
      case "acc":
      case "voc":
        return "oje";
      case "gen":
        return "ojego";
      case "dat":
        return "ojemu";
      case "ins":
      case "loc":
        return "oim";
    }
  }

  // masculine singular
  switch (kase) {
    case "nom":
    case "voc":
      return "ój";
    case "gen":
      return "ojego";
    case "dat":
      return "ojemu";
    case "acc":
      return gender === "mInanim" ? "ój" : "ojego";
    case "ins":
    case "loc":
      return "oim";
  }
}

/** Endings of the nasz paradigm; the virile nominative plural is handled apart. */
function naszEnding(gender: Gender, number: GramNumber, kase: Case): string {
  if (number === "pl") {
    const virile = gender === "mPers";
    switch (kase) {
      case "nom":
      case "voc":
        return virile ? "" : "e"; // virile never reaches here — see declinePossessive
      case "acc":
        return virile ? "ych" : "e";
      case "gen":
      case "loc":
        return "ych";
      case "dat":
        return "ym";
      case "ins":
        return "ymi";
    }
  }

  if (gender === "f") {
    switch (kase) {
      case "nom":
      case "voc":
        return "a";
      case "gen":
      case "dat":
      case "loc":
        return "ej";
      case "acc":
      case "ins":
        return "ą";
    }
  }

  if (gender === "n") {
    switch (kase) {
      case "nom":
      case "acc":
      case "voc":
        return "e";
      case "gen":
        return "ego";
      case "dat":
        return "emu";
      case "ins":
      case "loc":
        return "ym";
    }
  }

  // masculine singular
  switch (kase) {
    case "nom":
    case "voc":
      return "";
    case "gen":
      return "ego";
    case "dat":
      return "emu";
    case "acc":
      return gender === "mInanim" ? "" : "ego";
    case "ins":
    case "loc":
      return "ym";
  }
}

/** jego / jej / ich never change; everything else agrees with its noun. */
export function declinePossessive(
  owner: Possessive,
  gender: Gender,
  number: GramNumber,
  kase: Case,
): string {
  const info = OWNER_INFO[owner];
  if (info.family === "fixed") return info.lemma;
  if (info.family === "moj") {
    const stem = BARE_STEM[owner as keyof typeof BARE_STEM];
    return stem + mojEnding(gender, number, kase);
  }
  // nasz / wasz: sz softens to si in the masculine-personal nominative plural
  if (number === "pl" && gender === "mPers" && (kase === "nom" || kase === "voc")) {
    return info.lemma.replace(/sz$/, "si");
  }
  return info.lemma + naszEnding(gender, number, kase);
}

const isFixed = (owner: Possessive) => OWNER_INFO[owner].family === "fixed";

/**
 * "swój" only ever refers back to the subject, so it is drilled in the
 * sentences that have one; the rest are open to every possessor.
 */
export function templatesForOwner(
  owner: Possessive,
  kase: Case,
  number: GramNumber,
  maxLevel?: Level,
): Template[] {
  const templates = agreementTemplatesFor(kase, number, maxLevel);
  return owner === "swoj" ? templates.filter((t) => t.subject === "1sg") : templates;
}

function note(
  owner: Possessive,
  noun: Noun,
  number: GramNumber,
  kase: Case,
  tpl: Template,
): string {
  const info = OWNER_INFO[owner];
  const num = number === "pl" ? "plural" : "singular";
  const caseEn = CASE_INFO[kase].en.toLowerCase();

  if (isFixed(owner)) {
    return `"${info.lemma}" (${info.who}) never changes — it keeps one form in every case, so the ${caseEn} here leaves it alone. ${tpl.note}`;
  }

  const head = `"${info.lemma}" agrees with ${noun.lemma}: ${
    GENDER_WORD[genderGroup(noun.gender)]
  } ${num}, ${caseEn}. ${tpl.note}`;

  if (owner === "swoj") {
    return `${head} "Swój" is used because the owner is the subject of the sentence.`;
  }
  if (kase === "acc" && number === "sg") {
    if (noun.gender === "mInanim") {
      return `${head} Inanimate masculine — the accusative copies the nominative.`;
    }
    if (noun.gender === "mAnim" || noun.gender === "mPers") {
      return `${head} Animate masculine — the accusative copies the genitive.`;
    }
  }
  if (kase === "nom" && number === "pl" && noun.gender === "mPers") {
    return `${head} Masculine-personal plural — "${declinePossessive(
      owner,
      noun.gender,
      number,
      kase,
    )}", not the "${declinePossessive(owner, "mInanim", number, kase)}" used for everything else.`;
  }
  return head;
}

/** The SRS card and skill of a possessive question: owner × paradigm cell (plans/phase-2.md §1). */
export function possessiveCard(
  owner: Possessive,
  kase: Case,
  gender: Gender,
  number: GramNumber,
): { card: string; skill: string } {
  return { card: `possessives:${owner}|${kase}|${gender}|${number}`, skill: `possessives:${kase}|${number}` };
}

export function buildPossessiveExercise(
  owner: Possessive,
  kase: Case,
  numbers: GramNumber[],
  answerMode: AnswerMode,
  rng: () => number,
  taken: Set<string> = new Set(),
  genders?: GenderGroup[],
  maxLevel?: Level,
  /** Only nouns of exactly this gender: how an SRS card asks for its paradigm cell. */
  gender?: Gender,
): Exercise | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const number = pick(numbers, rng);
    const templates = templatesForOwner(owner, kase, number, maxLevel);
    if (templates.length === 0) continue;

    for (const tpl of shuffle(templates, rng)) {
      const fitting = nounsFor(tpl, number, genders, maxLevel);
      const nouns = gender ? fitting.filter((n) => n.gender === gender) : fitting;
      for (const noun of shuffle(nouns, rng)) {
        // "mój Polak", "mój komar": skipped after the shuffle, so no random draw changes
        if (noun.noPossessive) continue;
        const key = `${owner}|${tpl.pl}|${noun.lemma}|${number}`;
        if (taken.has(key) && attempt < 30) continue;
        taken.add(key);

        const form = declinePossessive(owner, noun.gender, number, kase);
        const nounText = nounForm(noun, number, kase);
        const [before, after] = tpl.pl.split("{NP}");
        const tokens: Token[] = [
          { text: form, blank: true },
          { text: nounText, blank: false },
        ];

        const answers = [form];
        // with "ja" as the subject, Polish prefers swój — accept it either way
        if (owner === "moj" && tpl.subject === "1sg") {
          answers.push(declinePossessive("swoj", noun.gender, number, kase));
        }

        const exercise: Exercise = {
          id: `${key}|${kase}`,
          case: kase,
          number,
          before,
          after,
          tokens,
          hint: `${OWNER_INFO[owner].lemma} · ${noun.lemma} · ${
            GENDER_WORD[genderGroup(noun.gender)]
          }`,
          en: renderAgreementEnglish(tpl, noun, OWNER_INFO[owner].en, number),
          answers,
          ...possessiveCard(owner, kase, noun.gender, number),
          note: note(owner, noun, number, kase, tpl),
        };

        if (answerMode === "choice") {
          const options = buildPossessiveOptions(owner, noun.gender, number, kase, answers, rng);
          if (options.length > 1) exercise.options = options;
        }

        return exercise;
      }
    }
  }
  return null;
}

/** The three indeclinable possessives, offered against each other in choice mode. */
const FIXED_OWNERS: Possessive[] = ["jego", "jej", "ich"];

/**
 * Multiple-choice distractors: other cells of the same paradigm. An
 * indeclinable possessive has no other cells, so it is set against the other
 * two indeclinables instead — the English gloss says whose it is.
 */
export function buildPossessiveOptions(
  owner: Possessive,
  gender: Gender,
  number: GramNumber,
  kase: Case,
  answers: string[],
  rng: () => number,
  count = 4,
): string[] {
  if (isFixed(owner)) {
    const correct = answers[0];
    const others = FIXED_OWNERS.filter((o) => o !== owner).map((o) => OWNER_INFO[o].lemma);
    return shuffle([correct, ...others], rng);
  }
  return buildAgreementOptions(
    (g, n, k) => declinePossessive(owner, g, n, k),
    gender,
    number,
    kase,
    answers,
    rng,
    count,
  );
}

/** Builds a full possessive session, spreading the selected cases evenly. */
export function buildPossessiveSession(config: Config, seed = Date.now()): Exercise[] {
  const rng = makeRng(seed);
  const selected = config.cases.filter((c): c is Case =>
    (POSSESSIVE_CASES as readonly string[]).includes(c),
  );
  const numbers = config.numbers.length ? config.numbers : (["sg"] as GramNumber[]);
  const cases = casesWithin(
    selected.length ? selected : (["nom"] as Case[]),
    config.maxLevel,
    (kase) => numbers.some((n) => agreementTemplatesFor(kase, n, config.maxLevel).length > 0),
  );
  const owners = config.owners?.length ? config.owners : [...POSSESSIVES];
  const answerMode: AnswerMode = config.answerMode === "choice" ? "choice" : "typing";

  const taken = new Set<string>();
  const exercises: Exercise[] = [];
  let pool: Case[] = [];
  for (let i = 0; i < config.count; i++) {
    if (pool.length === 0) pool = shuffle(cases, rng);
    const kase = pool.pop()!;
    // swój has no nominative sentence, so fall back to the other chosen owners
    for (const owner of shuffle(owners, rng)) {
      const exercise = buildPossessiveExercise(
        owner,
        kase,
        numbers,
        answerMode,
        rng,
        taken,
        config.genders,
        config.maxLevel,
      );
      if (exercise) {
        exercises.push(exercise);
        break;
      }
    }
  }
  return exercises;
}
