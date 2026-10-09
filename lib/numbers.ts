import {
  GENDER_WORD,
  agreementTemplatesFor,
  buildAgreementOptions,
  renderAgreementEnglish,
} from "./agreement";
import { CASE_INFO } from "./cases";
import { buildOptions } from "./choices";
import { capitalise, fitsTemplate, makeRng, nounForm, pick, resolvePrep, shuffle } from "./generate";
import { normalise, stripDiacritics } from "./grade";
import { NOUNS, nounVariants } from "./nouns";
import {
  MONTHS,
  cardinal,
  countingNumeral,
  declineNumeral,
  englishNumber,
  englishOrdinal,
  government,
  ordinal,
  ordinalLemma,
} from "./numerals";
import { NUMBER_CASES, NUMBER_DRILLS, genderGroup, withinLevel } from "./types";
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
  NumberDrill,
  SpellRange,
  Tag,
  Token,
} from "./types";

/**
 * The numbers exercise, four drills under one roof:
 *
 *   count    the noun after a numeral — pięć kotów, dwa koty, jeden kot
 *   numeral  the numeral itself, agreeing with the noun and the case
 *   spell    a figure written out in words
 *   ordinal  pierwszy / drugi / trzeci, plus dates and clock times
 */

const withPlural = (noun: Noun) => !noun.noPlural && noun.pl !== undefined;

/** "dwanaście miłości" is grammar with no sentence behind it. */
const COUNTABLE: Tag[] = [
  "person", "animal", "object", "vehicle", "text", "food", "drink",
  "placeIn", "placeTo", "surface", "plant", "water", "show",
];

/**
 * The nouns to count, up to `maxLevel` when set. The level only narrows the
 * words: the frames here are fixed per sub-drill and stay as they are.
 */
function lexicon(genders?: GenderGroup[], maxLevel?: Level): Noun[] {
  const countable = NOUNS.filter(
    (n) => withPlural(n) && fitsTemplate(n, { requires: COUNTABLE }) && withinLevel(n, maxLevel),
  );
  if (!genders || genders.length === 0) return countable;
  const wanted = countable.filter((n) => genders.includes(genderGroup(n.gender)));
  // a filter that leaves nothing to count would strand the noun-based drills
  return wanted.length > 0 ? wanted : countable;
}

/** English for a counted phrase: "five cats", "one cat". */
const countedEn = (n: number, noun: Noun) =>
  `${englishNumber(n)} ${n === 1 ? noun.en : noun.enPl}`;

// ------------------------------------------------------------ 1 · counting

type CountTemplate = {
  /** Polish frame with {N} for the numeral and {NP} for the counted noun. */
  pl: string;
  en: string;
  /** The case the frame itself assigns — it only shows with "jeden". */
  case: "nom" | "acc";
  /** Which nouns the sentence makes sense with — see Template. */
  requires: Tag[];
  lemmas?: string[];
  excludeLemmas?: string[];
};

/** Things that could sit "here": "Tu są trzy krzesła", not "Tu są dwa miasta". */
const HERE: Pick<CountTemplate, "requires" | "excludeLemmas"> = {
  requires: ["person", "animal", "object", "vehicle", "text", "food", "drink", "surface", "placeIn"],
  excludeLemmas: ["kuchnia", "miasto", "ogród", "woda", "obiad", "zupa", "słoń", "rodzina"],
};
/** Things you'd see out of a window or in a photo. */
const IN_VIEW: Pick<CountTemplate, "requires" | "excludeLemmas"> = {
  requires: ["person", "animal", "vehicle", "placeIn", "placeTo", "water", "plant", "food"],
  excludeLemmas: ["kuchnia", "pokój", "bank", "apteka", "biuro", "morze", "zupa", "obiad", "rodzina"],
};

const COUNT_TEMPLATES: CountTemplate[] = [
  { pl: "Mam {N} {NP}.", en: "I have {np}.", case: "acc",
    requires: ["animal", "object", "vehicle", "text", "food"], lemmas: ["dom", "mieszkanie", "pokój"],
    excludeLemmas: ["słoń", "zwierzę", "list", "gazeta", "radio", "zupa", "obiad", "samolot", "pociąg", "autobus"] },
  { pl: "Widzę {N} {NP}.", en: "I can see {np}.", case: "acc", ...IN_VIEW },
  { pl: "Tu {V} {N} {NP}.", en: "There {is} {np} here.", case: "nom", ...HERE },
  { pl: "Na zdjęciu {V} {N} {NP}.", en: "There {is} {np} in the photo.", case: "nom", ...IN_VIEW },
];

/**
 * The numbers the counting drill draws from — deliberately loaded with the
 * traps: the teens, and the compounds whose last digit decides everything.
 */
const COUNT_POOL = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 30, 31, 32, 42, 52, 100, 101, 102, 112, 113, 122, 123,
];

function countNote(n: number, noun: Noun): string {
  const last2 = n % 100;
  const teen = last2 >= 12 && last2 <= 14;
  const tail = n > 20 ? ` What counts is how "${cardinal(n)}" ends.` : "";

  if (n === 1) {
    return `"Jeden" imposes nothing: the noun stays singular and takes whatever case the sentence asks for.${tail}`;
  }
  if (noun.gender === "mPers" && government(n, noun.gender) === "genPl") {
    return `Counting men, the numeral takes the -u / -ch form and the noun goes into the genitive plural.${tail}`;
  }
  if (government(n, noun.gender) === "nomPl") {
    return `2, 3 and 4 take the nominative plural — the noun looks like a plain plural.${tail}`;
  }
  if (teen) {
    return `A trap: 12, 13 and 14 are not "small" numbers — like 5 and up they take the genitive plural.${tail}`;
  }
  return `5 and up take the genitive plural.${tail}`;
}

function buildCountExercise(
  n: number,
  nouns: Noun[],
  rng: () => number,
  taken: Set<string>,
): Exercise | null {
  for (const tpl of shuffle(COUNT_TEMPLATES, rng)) {
    for (const noun of shuffle(nouns, rng)) {
      if (!fitsTemplate(noun, tpl)) continue;
      const key = `count|${n}|${noun.lemma}|${tpl.pl}`;
      if (taken.has(key)) continue;
      taken.add(key);

      const cell = countedCell(n, noun.gender, tpl.case);
      const numeral = declineNumeral(n, noun.gender, tpl.case)[0];
      const answers = nounVariants(noun, cell.number, cell.case);
      if (answers.length === 0) continue;

      // "są" only for a 2-4 phrase; the genitive-plural phrase stays singular
      const verb = cell.case === "nom" && cell.number === "pl" ? "są" : "jest";
      const frame = tpl.pl.replace("{V}", verb).replace("{N}", numeral);
      const [before, after] = frame.split("{NP}");

      const tokens: Token[] = [{ text: answers[0], blank: true }];
      return {
        id: key,
        case: cell.case,
        number: cell.number,
        before,
        after,
        tokens,
        hint: noun.lemma,
        en: capitalise(
          tpl.en
            .replace("{is}", n === 1 ? "is" : "are")
            .replace("{np}", countedEn(n, noun)),
        ),
        answers,
        note: countNote(n, noun),
        source: { noun },
      };
    }
  }
  return null;
}

// ------------------------------------------------------- 2 · the numeral

/** Simple numerals only: compounds decline both halves, which is another lesson. */
const NUMERAL_POOL = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  30, 40, 50, 60, 70, 80, 90, 100,
];

type NumeralTemplate = Pick<CountTemplate, "requires" | "lemmas" | "excludeLemmas"> & {
  pl: string;
  en: string;
};

/** People you'd help or talk to in a group: "pięciu studentom", "z trzema kolegami". */
const PEOPLE: Pick<CountTemplate, "requires" | "excludeLemmas"> = {
  requires: ["person"],
  excludeLemmas: ["pan", "pani", "rodzina"],
};

const NUMERAL_TEMPLATES: Record<Case, NumeralTemplate> = {
  nom: { pl: "Tu {V} {NP}.", en: "There {is} {np} here.", ...HERE },
  gen: { pl: "Szukam {NP}.", en: "I'm looking for {np}.",
    requires: ["animal", "object", "profession"], excludeLemmas: ["słoń", "radio", "stół", "łóżko", "biurko"] },
  dat: { pl: "Pomagam {NP}.", en: "I'm helping {np}.", ...PEOPLE },
  acc: { pl: "Widzę {NP}.", en: "I can see {np}.", ...IN_VIEW },
  ins: { pl: "Rozmawiam {z} {NP}.", en: "I'm talking with {np}.", ...PEOPLE },
  loc: { pl: "Myślę o {NP}.", en: "I'm thinking about {np}.",
    requires: ["person", "animal", "placeIn", "placeTo", "vehicle"],
    excludeLemmas: ["pan", "pani", "rodzina", "kuchnia", "pokój", "bank", "apteka", "biuro"] },
  voc: { pl: "Widzę {NP}.", en: "I can see {np}.", ...IN_VIEW },
};

/** Which cell the counted noun sits in once the numeral is in `kase`. */
export function countedCell(
  n: number,
  gender: Gender,
  kase: Case,
): { case: Case; number: GramNumber } {
  // "jeden" quantifies nothing: the phrase behaves like a plain singular noun
  if (n === 1) return { case: kase, number: "sg" };
  if (kase === "nom" || kase === "acc" || kase === "voc") {
    // 2-4 pluralise the noun in place; 5 and up drag it into the genitive
    return government(n, gender) === "genPl"
      ? { case: "gen", number: "pl" }
      : { case: kase, number: "pl" };
  }
  // outside the nominative the numeral simply agrees — no quantifier rule left
  return { case: kase, number: "pl" };
}

function numeralNote(n: number, noun: Noun, kase: Case): string {
  const caseEn = CASE_INFO[kase].en.toLowerCase();
  const gender = GENDER_WORD[genderGroup(noun.gender)];

  if (n === 1) {
    return `"Jeden" declines like an adjective and agrees with ${noun.lemma}: ${gender} ${caseEn}.`;
  }
  if (kase === "nom" || kase === "acc") {
    if (noun.gender === "mPers") {
      const head = `Counting men, the numeral takes its -u / -ch form: ${countingNumeral(
        n,
        noun.gender,
      )} ${nounForm(noun, "pl", "gen")}.`;
      const virile = ["", "", "dwaj", "trzej", "czterej"][n];
      return virile
        ? `${head} "${virile} ${nounForm(noun, "pl", "nom")}" says the same thing the other way.`
        : head;
    }
    if (n % 10 === 2 && n % 100 !== 12 && noun.gender === "f") {
      return `In front of a feminine noun 2 is "dwie", not "dwa".`;
    }
    return government(n, noun.gender) === "genPl"
      ? `The numeral keeps its counting form in the ${caseEn} — and 5 and up push the noun into the genitive plural.`
      : `The numeral keeps its counting form in the ${caseEn}, and 2-4 leave the noun a plain plural.`;
  }
  if (kase === "ins") {
    return `Outside the nominative the numeral just agrees with the noun. The instrumental of 5 and up ends in -oma; the -u form is accepted too.`;
  }
  return `Outside the nominative the numeral just agrees with the noun — ${caseEn} plural.`;
}

function buildNumeralExercise(
  n: number,
  kase: Case,
  nouns: Noun[],
  answerMode: AnswerMode,
  rng: () => number,
  taken: Set<string>,
): Exercise | null {
  const tpl = NUMERAL_TEMPLATES[kase];
  for (const noun of shuffle(nouns, rng)) {
    if (!fitsTemplate(noun, tpl)) continue;
    const key = `numeral|${n}|${noun.lemma}|${kase}`;
    if (taken.has(key)) continue;
    taken.add(key);

    const answers = declineNumeral(n, noun.gender, kase);
    const cell = countedCell(n, noun.gender, kase);
    const nounText = nounVariants(noun, cell.number, cell.case)[0];
    if (!nounText) continue;

    const verb = cell.case === "nom" && cell.number === "pl" ? "są" : "jest";
    const [before, after] = tpl.pl
      .replace("{V}", verb)
      .replace("{z}", resolvePrep("z", answers[0]))
      .split("{NP}");

    const exercise: Exercise = {
      id: key,
      case: kase,
      number: n === 1 ? "sg" : "pl",
      before,
      after,
      tokens: [
        { text: answers[0], blank: true },
        { text: nounText, blank: false },
      ],
      hint: String(n),
      en: capitalise(
        tpl.en.replace("{is}", n === 1 ? "is" : "are").replace("{np}", countedEn(n, noun)),
      ),
      answers,
      note: numeralNote(n, noun, kase),
    };

    if (answerMode === "choice") {
      // the same numeral in its other cases — numerals have no number of their own
      const options = buildAgreementOptions(
        (g, _num, k) => declineNumeral(n, g, k)[0],
        noun.gender,
        exercise.number,
        kase,
        answers,
        rng,
      );
      if (options.length > 1) exercise.options = options;
    }
    return exercise;
  }
  return null;
}

// --------------------------------------------------------- 3 · in figures

/** Three plausible near misses: the neighbours and a swapped decade. */
function spellDistractors(n: number, max: number, rng: () => number): string[] {
  const near = [n + 1, n - 1, n + 10, n - 10, n + 100, n - 100, n + 2, n - 2]
    .filter((x) => x >= 0 && x <= max && x !== n);
  const out: string[] = [];
  for (const candidate of shuffle(near, rng)) {
    const word = cardinal(candidate);
    if (!out.includes(word)) out.push(word);
    if (out.length === 3) break;
  }
  return out;
}

function buildSpellExercise(
  max: SpellRange,
  answerMode: AnswerMode,
  rng: () => number,
  taken: Set<string>,
): Exercise | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const n = Math.floor(rng() * (max + 1));
    const key = `spell|${n}`;
    if (taken.has(key) && attempt < 30) continue;
    taken.add(key);

    const word = cardinal(n);
    const exercise: Exercise = {
      id: key,
      case: "nom",
      number: "sg",
      label: "Liczba",
      before: "",
      after: "",
      tokens: [{ text: word, blank: true }],
      hint: String(n),
      en: capitalise(englishNumber(n)),
      answers: [word],
      note:
        n >= 100 && n % 100 !== 0
          ? `Polish stacks the parts with no "and": ${word}.`
          : `${n} = ${word}.`,
    };
    if (answerMode === "choice") {
      const options = spellDistractors(n, max, rng);
      if (options.length > 0) exercise.options = shuffle([word, ...options], rng);
    }
    return exercise;
  }
  return null;
}

// ----------------------------------------------------------- 4 · ordinals

type OrdinalFlavour = "agreement" | "date" | "time";

const HOUR_EN = [
  "twelve", "one", "two", "three", "four", "five", "six",
  "seven", "eight", "nine", "ten", "eleven",
];

const OTHER_GENDERS: Gender[] = ["mInanim", "f", "n"];

/**
 * Distractors for an ordinal: the same word in its other singular cases first,
 * then the same case agreeing with a different gender. Ordinals are only ever
 * drilled in the singular, so the plural cells are left out of the pool.
 */
function ordinalChoices(
  n: number,
  gender: Gender,
  kase: Case,
  answers: string[],
  rng: () => number,
  count = 4,
): string[] {
  const correct = answers[0];
  const taken = new Set(answers.map((a) => stripDiacritics(normalise(a))));
  const near: string[] = [];
  const far: string[] = [];

  const add = (bucket: string[], text: string) => {
    const key = stripDiacritics(normalise(text));
    if (taken.has(key)) return;
    taken.add(key);
    bucket.push(text);
  };

  for (const k of NUMBER_CASES) {
    if (k !== kase) add(near, ordinal(n, gender, "sg", k));
  }
  for (const g of OTHER_GENDERS) {
    if (genderGroup(g) !== genderGroup(gender)) add(far, ordinal(n, g, "sg", kase));
  }

  const distractors = [...shuffle(near, rng), ...shuffle(far, rng)].slice(0, count - 1);
  if (distractors.length < 1) return [];
  return shuffle([correct, ...distractors], rng);
}

function buildDateExercise(
  answerMode: AnswerMode,
  rng: () => number,
  taken: Set<string>,
): Exercise | null {
  for (let attempt = 0; attempt < 20; attempt++) {
    const month = pick(MONTHS, rng);
    const day = 1 + Math.floor(rng() * month.days);
    const key = `date|${day}|${month.nom}`;
    if (taken.has(key) && attempt < 15) continue;
    taken.add(key);

    const form = ordinal(day, "mInanim", "sg", "gen");
    const frames = [
      { pl: ["Dziś jest ", ` ${month.gen}.`], en: `Today is the ${englishOrdinal(day)} of ${month.en}.` },
      { pl: ["Wracam ", ` ${month.gen}.`], en: `I'm coming back on the ${englishOrdinal(day)} of ${month.en}.` },
    ];
    const frame = pick(frames, rng);

    const exercise: Exercise = {
      id: key,
      case: "gen",
      number: "sg",
      label: "Data",
      before: frame.pl[0],
      after: frame.pl[1],
      tokens: [{ text: form, blank: true }],
      hint: `${day}. · ${month.nom}`,
      en: frame.en,
      answers: [form],
      note: `A date is an ordinal in the genitive — "${ordinalLemma(
        day,
      )}" becomes "${form}", and the month follows in the genitive too (${month.nom} → ${month.gen}).`,
    };
    if (answerMode === "choice") {
      const options = ordinalChoices(day, "mInanim", "gen", exercise.answers, rng);
      if (options.length > 1) exercise.options = options;
    }
    return exercise;
  }
  return null;
}

function buildTimeExercise(
  answerMode: AnswerMode,
  rng: () => number,
  taken: Set<string>,
): Exercise | null {
  for (let attempt = 0; attempt < 20; attempt++) {
    const hour = 1 + Math.floor(rng() * 12);
    const asked = rng() < 0.5 ? "loc" : "nom";
    const key = `time|${hour}|${asked}`;
    if (taken.has(key) && attempt < 15) continue;
    taken.add(key);

    const en = HOUR_EN[hour % 12];
    const form = ordinal(hour, "f", "sg", asked as Case);
    const frame =
      asked === "loc"
        ? { before: "Spotkanie jest o ", after: ".", en: `The meeting is at ${en} o'clock.` }
        : { before: "Jest ", after: ".", en: `It's ${en} o'clock.` };

    const exercise: Exercise = {
      id: key,
      case: asked as Case,
      number: "sg",
      label: "Godzina",
      before: frame.before,
      after: frame.after,
      tokens: [{ text: form, blank: true }],
      hint: `${hour}:00`,
      en: frame.en,
      answers: [form],
      note:
        asked === "loc"
          ? `The hour is a feminine ordinal agreeing with the unspoken "godzina", and "o" puts it in the locative: o ${form}.`
          : `"Która godzina?" — the hour is a feminine ordinal in the nominative: ${form}.`,
    };
    if (answerMode === "choice") {
      const options = ordinalChoices(hour, "f", asked as Case, exercise.answers, rng);
      if (options.length > 1) exercise.options = options;
    }
    return exercise;
  }
  return null;
}

/** Ordinals are drilled in the singular — "the twelfth shops" is not a phrase. */
function buildOrdinalAgreement(
  kase: Case,
  nouns: Noun[],
  answerMode: AnswerMode,
  rng: () => number,
  taken: Set<string>,
): Exercise | null {
  const number: GramNumber = "sg";
  for (let attempt = 0; attempt < 20; attempt++) {
    const templates = agreementTemplatesFor(kase, number);
    if (templates.length === 0) continue;

    for (const tpl of shuffle(templates, rng)) {
      for (const noun of shuffle(nouns, rng)) {
        const n = 1 + Math.floor(rng() * 20);
        const key = `ord|${n}|${noun.lemma}|${tpl.pl}|${number}`;
        if (taken.has(key) && attempt < 15) continue;
        taken.add(key);

        const nounText = nounVariants(noun, number, kase)[0];
        if (!nounText) continue;

        const form = ordinal(n, noun.gender, number, kase);
        const [before, after] = tpl.pl.split("{NP}");
        const exercise: Exercise = {
          id: key,
          case: kase,
          number,
          before,
          after,
          tokens: [
            { text: form, blank: true },
            { text: nounText, blank: false },
          ],
          hint: `${n}. · ${noun.lemma}`,
          en: renderAgreementEnglish(tpl, noun, `the ${englishOrdinal(n)}`, number),
          answers: [form],
          note: `An ordinal is an adjective: "${ordinalLemma(n)}" agrees with ${noun.lemma} — ${
            GENDER_WORD[genderGroup(noun.gender)]
          } singular, ${CASE_INFO[kase].en.toLowerCase()}. ${tpl.note}`,
        };

        if (answerMode === "choice") {
          const options = ordinalChoices(n, noun.gender, kase, exercise.answers, rng);
          if (options.length > 1) exercise.options = options;
        }
        return exercise;
      }
    }
  }
  return null;
}

// ------------------------------------------------------------- the session

/** Builds one exercise of the named drill, or null when nothing fits. */
function buildOne(
  drill: NumberDrill,
  config: Config,
  cases: Case[],
  nouns: Noun[],
  answerMode: AnswerMode,
  rng: () => number,
  taken: Set<string>,
): Exercise | null {
  if (drill === "spell") return buildSpellExercise(config.max ?? 100, answerMode, rng, taken);

  if (drill === "count") {
    const exercise = buildCountExercise(pick(COUNT_POOL, rng), nouns, rng, taken);
    if (exercise && answerMode === "choice") {
      const options = buildOptions(exercise, rng);
      if (options.length > 1) exercise.options = options;
    }
    return exercise;
  }

  if (drill === "numeral") {
    return buildNumeralExercise(
      pick(NUMERAL_POOL, rng),
      pick(cases, rng),
      nouns,
      answerMode,
      rng,
      taken,
    );
  }

  // ordinals: rotate between plain agreement, dates and clock times
  const flavour = pick<OrdinalFlavour>(["agreement", "date", "time"], rng);
  if (flavour === "date") return buildDateExercise(answerMode, rng, taken);
  if (flavour === "time") return buildTimeExercise(answerMode, rng, taken);
  return buildOrdinalAgreement(pick(cases, rng), nouns, answerMode, rng, taken);
}

/** Builds a full numbers session, spreading the selected drills evenly. */
export function buildNumberSession(config: Config, seed = Date.now()): Exercise[] {
  const rng = makeRng(seed);
  const drills = config.drills?.length ? config.drills : [...NUMBER_DRILLS];
  const selected = config.cases.filter((c): c is Case =>
    (NUMBER_CASES as readonly string[]).includes(c),
  );
  const cases = selected.length ? selected : [...NUMBER_CASES];
  const nouns = lexicon(config.genders, config.maxLevel);
  const answerMode: AnswerMode = config.answerMode === "choice" ? "choice" : "typing";

  const taken = new Set<string>();
  const exercises: Exercise[] = [];
  let pool: NumberDrill[] = [];

  // a drill that runs dry falls back to the others rather than dropping a question
  const attempt = (drill: NumberDrill): Exercise | null => {
    for (const candidate of [drill, ...shuffle(drills, rng)]) {
      const exercise = buildOne(candidate, config, cases, nouns, answerMode, rng, taken);
      if (exercise) return exercise;
    }
    return null;
  };

  for (let i = 0; i < config.count; i++) {
    if (pool.length === 0) pool = shuffle(drills, rng);
    const drill = pool.pop()!;
    let exercise = attempt(drill);
    if (!exercise) {
      // every drill is out of unseen material: forget it all and start repeating
      taken.clear();
      exercise = attempt(drill);
    }
    if (exercise) exercises.push(exercise);
  }
  return exercises;
}
