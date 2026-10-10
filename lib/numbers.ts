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
import { LEXICON } from "./lexicon";
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
import { LEVELS, NUMBER_CASES, NUMBER_DRILLS, genderGroup, withinLevel } from "./types";
import type {
  AnswerMode,
  Case,
  Config,
  CountTemplate,
  Exercise,
  Gender,
  GenderGroup,
  GramNumber,
  Level,
  Noun,
  NumberDrill,
  NumeralTemplate,
  SpellRange,
  Tag,
  Template,
  Token,
} from "./types";

/**
 * The numbers exercise, four drills under one roof:
 *
 *   count    the noun after a numeral — pięć kotów, dwa koty, jeden kot
 *   numeral  the numeral itself, agreeing with the noun and the case
 *   spell    a figure written out in words
 *   ordinal  pierwszy / drugi / trzeci, plus dates and clock times
 *
 * Every exercise carries an SRS `card` and `skill` (`numbers:<drill>|<facet…>`).
 * The facets are a grammar rule × a range of numbers, never a single sentence:
 * the count band, the numeral class, the spelling magnitude, the ordinal flavour,
 * each with the case where the case changes the form. The exact scheme, the
 * levels and the order cards are introduced in are documented in
 * lib/cards/numbers.ts; the facet functions and `buildNumberCard` (one exercise
 * for exactly one card) live at the bottom of this file. Tagging an exercise
 * reads what was already drawn and never touches the RNG, so configured
 * sessions are unchanged by it.
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

/**
 * Whether a frame can count (or number) this noun: it has to fit the frame's
 * requires / lemmas / excludeLemmas, and a mass noun only counts in portions
 * (dwie kawy, pięć chlebów), never "dziewiętnaście traw", unless the frame
 * names it. The candidates are checked one by one after the shuffle, so a
 * skipped noun costs no random draw and the rest of a session stays as it was.
 */
export function countsIn(noun: Noun, tpl: Pick<CountTemplate, "requires" | "lemmas" | "excludeLemmas">): boolean {
  if (!fitsTemplate(noun, tpl)) return false;
  return !noun.mass || !!noun.portions || !!tpl.lemmas?.includes(noun.lemma);
}

/** English for a counted phrase: "five cats", "one cat". */
const countedEn = (n: number, noun: Noun) =>
  `${englishNumber(n)} ${n === 1 ? noun.en : noun.enPl}`;

// ------------------------------------------------------------ 1 · counting

/**
 * The counting sentences, in data/count-frames.json. "@inView" / "@notInView"
 * are the things you'd see out of a window or in a photo, "@notHere" what
 * could not sit "here" ("Tu są trzy krzesła", not "Tu są dwa miasta").
 */
const COUNT_TEMPLATES: CountTemplate[] = LEXICON.counting;

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
  templates: CountTemplate[] = COUNT_TEMPLATES,
): Exercise | null {
  for (const tpl of shuffle(templates, rng)) {
    for (const noun of shuffle(nouns, rng)) {
      if (!countsIn(noun, tpl)) continue;
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
        ...cardOf("count", countBand(n, noun.gender), tpl.case),
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

/**
 * The numeral drill's one sentence per case, in data/numeral-frames.json.
 * "@notCounted" keeps out the people you would not talk to in a group of five
 * (pan, pani, rodzina). A case whose frame is still a draft has none.
 */
const NUMERAL_TEMPLATES: Partial<Record<Case, NumeralTemplate>> = LEXICON.numerals;

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
  if (!tpl) return null;
  for (const noun of shuffle(nouns, rng)) {
    if (!countsIn(noun, tpl)) continue;
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
      ...cardOf("numeral", numeralClass(n, noun.gender, kase), kase),
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
    return spellExercise(n, max, answerMode, rng);
  }
  return null;
}

/** The figure `n` to write out; choice mode draws its near misses from 0..max. */
function spellExercise(n: number, max: number, answerMode: AnswerMode, rng: () => number): Exercise {
  const word = cardinal(n);
  const exercise: Exercise = {
    id: `spell|${n}`,
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
    ...cardOf("spell", spellMagnitude(n)),
  };
  if (answerMode === "choice") {
    const options = spellDistractors(n, max, rng);
    if (options.length > 0) exercise.options = shuffle([word, ...options], rng);
  }
  return exercise;
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
      ...cardOf("ordinal", "date", "gen"),
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
  /** Ask this case instead of drawing one (targeted card builds only). */
  only?: "nom" | "loc",
): Exercise | null {
  for (let attempt = 0; attempt < 20; attempt++) {
    const hour = 1 + Math.floor(rng() * 12);
    const asked = only ?? (rng() < 0.5 ? "loc" : "nom");
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
      ...cardOf("ordinal", "time", asked),
    };
    if (answerMode === "choice") {
      const options = ordinalChoices(hour, "f", asked as Case, exercise.answers, rng);
      if (options.length > 1) exercise.options = options;
    }
    return exercise;
  }
  return null;
}

/**
 * The shuffled nouns as a frame takes them: one it cannot take ("Opiekuję się
 * drugą kolacją", "Widzę jedenastą trawę") gives way to the next one it can of
 * the same gender, so the ending drilled and the options offered stay the ones
 * drawn; with none of that gender left it is skipped.
 */
function takenBy(tpl: Template, shuffled: Noun[]): Noun[] {
  const used = new Set<Noun>();
  const out: Noun[] = [];
  for (const [i, noun] of shuffled.entries()) {
    const fit = [noun, ...shuffled.slice(i + 1)].find(
      (n) => !used.has(n) && n.gender === noun.gender && countsIn(n, tpl),
    );
    if (!fit) continue;
    used.add(fit);
    out.push(fit);
  }
  return out;
}

/** Ordinals are drilled in the singular — "the twelfth shops" is not a phrase. */
function buildOrdinalAgreement(
  kase: Case,
  nouns: Noun[],
  answerMode: AnswerMode,
  rng: () => number,
  taken: Set<string>,
  /** Frames above this level are left out (targeted card builds only). */
  maxLevel?: Level,
): Exercise | null {
  const number: GramNumber = "sg";
  for (let attempt = 0; attempt < 20; attempt++) {
    const templates = agreementTemplatesFor(kase, number, maxLevel);
    if (templates.length === 0) continue;

    for (const tpl of shuffle(templates, rng)) {
      for (const noun of takenBy(tpl, shuffle(nouns, rng))) {
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
          ...cardOf("ordinal", "plain", kase),
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
  const attempt = (drill: NumberDrill, from = nouns): Exercise | null => {
    for (const candidate of [drill, ...shuffle(drills, rng)]) {
      const exercise = buildOne(candidate, config, cases, from, answerMode, rng, taken);
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
    if (!exercise && config.genders?.length) {
      // the genders chosen have no noun the frame can take (no neuter person is
      // counted: dziecko wants "dwoje", see @collective), so count any gender
      exercise = attempt(drill, lexicon(undefined, config.maxLevel));
    }
    if (exercise) exercises.push(exercise);
  }
  return exercises;
}

// ------------------------------------------------------------- SRS cards

/** Card and skill ids for one exercise: `numbers:<drill>|<facets>`; the skill keeps the first facet. */
function cardOf(drill: NumberDrill, ...facets: string[]): { card: string; skill: string } {
  return { card: `numbers:${drill}|${facets.join("|")}`, skill: `numbers:${drill}|${facets[0]}` };
}

/** What decides the counted noun's form, in the order a learner meets it. */
export const COUNT_BANDS = ["1", "2-4", "5+", "teens", "compound2-4", "compound", "men"] as const;
export type CountBand = (typeof COUNT_BANDS)[number];

/**
 * The counting rule a number falls under for a noun of this gender: 1; plain
 * 2-4; 5-10 and round numbers (20, 30, 100); the -naście numbers (11-19 and
 * 111-119: the 12-14 trap); compounds ending in 2-4 (22, 32, 102: nominative
 * plural); other compounds (21, 25, 101: genitive plural); and men, where
 * every n ≥ 2 takes the -u form and the genitive plural.
 */
export function countBand(n: number, gender: Gender): CountBand {
  if (n === 1) return "1";
  if (gender === "mPers") return "men";
  if (n >= 2 && n <= 4) return "2-4";
  const last2 = n % 100;
  if (last2 >= 11 && last2 <= 19) return "teens";
  if (n <= 10 || n % 10 === 0) return "5+";
  return government(n, gender) === "nomPl" ? "compound2-4" : "compound";
}

/** The numeral's own paradigm: jeden, 2-4, 5 and up (teens and tens alike), sto, and the men's -u form. */
export const NUMERAL_CLASSES = ["1", "2-4", "5+", "100", "men"] as const;
export type NumeralClass = (typeof NUMERAL_CLASSES)[number];

export function numeralClass(n: number, gender: Gender, kase: Case): NumeralClass {
  if (n === 1) return "1";
  // only the nominative and accusative tell men apart: pięciu studentów, pięć kotów
  if (gender === "mPers" && (kase === "nom" || kase === "acc")) return "men";
  if (n >= 2 && n <= 4) return "2-4";
  return n === 100 ? "100" : "5+";
}

/** How big a figure to write out; the thousands split by what "tysiąc" turns into. */
export const SPELL_MAGNITUDES = [
  "units", "teens", "tens", "hundreds", "thousand", "thousands2-4", "thousands5+",
] as const;
export type SpellMagnitude = (typeof SPELL_MAGNITUDES)[number];

/** The figures each magnitude covers, inclusive. */
export const SPELL_SPANS: Record<SpellMagnitude, [number, number]> = {
  units: [0, 10],
  teens: [11, 19],
  tens: [20, 99],
  hundreds: [100, 999],
  thousand: [1000, 1999], // tysiąc
  "thousands2-4": [2000, 4999], // dwa tysiące
  "thousands5+": [5000, 9999], // pięć tysięcy
};

export function spellMagnitude(n: number): SpellMagnitude {
  return SPELL_MAGNITUDES.find((m) => n <= SPELL_SPANS[m][1]) ?? "thousands5+";
}

/** The numbers a count band is drilled with: the counting pool, split by band. */
const bandNumbers = (band: CountBand): number[] =>
  band === "men"
    ? COUNT_POOL.filter((n) => n > 1)
    : COUNT_POOL.filter((n) => countBand(n, "mInanim") === band);

/** The numbers a numeral class is drilled with: the numeral pool, split by class. */
const classNumbers = (cls: NumeralClass): number[] =>
  cls === "men"
    ? NUMERAL_POOL.filter((n) => n > 1)
    : NUMERAL_POOL.filter((n) => numeralClass(n, "mInanim", "gen") === cls);

const levelIndex = (level: Level) => LEVELS.indexOf(level);
const higher = (a: Level, b: Level): Level => (levelIndex(a) >= levelIndex(b) ? a : b);

/** The easiest of some levels, or null when there are none. */
const easiest = (levels: Level[]): Level | null =>
  levels.length === 0 ? null : levels.reduce((a, b) => (levelIndex(a) <= levelIndex(b) ? a : b));

/** The grammar's own level for a card, before its words and frames have their say. */
function ruleLevel(drill: NumberDrill, facets: string[]): Level {
  const [head, kase] = facets;
  if (drill === "count") {
    if (head === "men") return "B1";
    return head === "1" || head === "2-4" || head === "5+" ? "A1" : "A2";
  }
  if (drill === "numeral") {
    if (head === "men" || (kase !== "nom" && kase !== "acc")) return "B1";
    return head === "100" ? "A2" : "A1";
  }
  if (drill === "spell") return head === "units" || head === "teens" || head === "tens" ? "A1" : "A2";
  if (head === "date") return "A2";
  if (head === "time") return kase === "nom" ? "A1" : "A2";
  return "A1"; // plain ordinals: the frame's own level decides the oblique cases
}

/**
 * The easiest level a card can be built at: its rule level, raised to the
 * easiest noun (for plain ordinals, noun and frame together) that can carry
 * it. Null when no published word or frame can.
 */
function cardLevel(drill: NumberDrill, facets: string[]): Level | null {
  const nouns = lexicon();
  const rule = ruleLevel(drill, facets);
  let words: Level | null = rule;

  if (drill === "count") {
    const band = facets[0] as CountBand;
    const kase = facets[1] as Case;
    const n = bandNumbers(band)[0];
    if (n === undefined) return null;
    words = easiest(
      COUNT_TEMPLATES.filter((t) => t.case === kase).flatMap((tpl) =>
        nouns
          .filter((noun) => countBand(n, noun.gender) === band && countsIn(noun, tpl))
          .filter((noun) => {
            const cell = countedCell(n, noun.gender, kase);
            return nounVariants(noun, cell.number, cell.case).length > 0;
          })
          .map((noun) => noun.level),
      ),
    );
  } else if (drill === "numeral") {
    const cls = facets[0] as NumeralClass;
    const kase = facets[1] as Case;
    const tpl = NUMERAL_TEMPLATES[kase];
    const n = classNumbers(cls)[0];
    if (!tpl || n === undefined) return null;
    words = easiest(
      nouns
        .filter((noun) => numeralClass(n, noun.gender, kase) === cls && countsIn(noun, tpl))
        .filter((noun) => {
          const cell = countedCell(n, noun.gender, kase);
          return !!nounVariants(noun, cell.number, cell.case)[0];
        })
        .map((noun) => noun.level),
    );
  } else if (drill === "ordinal" && facets[0] === "plain") {
    const kase = facets[1] as Case;
    words = easiest(
      agreementTemplatesFor(kase, "sg").flatMap((tpl) =>
        nouns
          .filter((noun) => countsIn(noun, tpl) && !!nounVariants(noun, "sg", kase)[0])
          .map((noun) => higher(tpl.level, noun.level)),
      ),
    );
  }
  return words && higher(rule, words);
}

/** The count frames' two cases, and the other drills' cases in teaching order. */
const COUNT_CASES: Case[] = ["nom", "acc"];
const TEACHING_CASES: Case[] = ["nom", "acc", "gen", "loc", "ins", "dat"];

/** Every candidate card in teaching order: spell, count, numeral, ordinal; small numbers first. */
function candidates(): [NumberDrill, string[]][] {
  const out: [NumberDrill, string[]][] = [];
  for (const m of SPELL_MAGNITUDES) out.push(["spell", [m]]);
  for (const b of COUNT_BANDS) for (const k of COUNT_CASES) out.push(["count", [b, k]]);
  for (const c of NUMERAL_CLASSES) for (const k of TEACHING_CASES) out.push(["numeral", [c, k]]);
  out.push(["ordinal", ["time", "nom"]], ["ordinal", ["time", "loc"]], ["ordinal", ["date", "gen"]]);
  for (const k of TEACHING_CASES) out.push(["ordinal", ["plain", k]]);
  return out;
}

export type NumberCardInfo = { id: string; skill: string; level: Level };

let catalog: NumberCardInfo[] | null = null;

/**
 * Every card the loaded lexicon can build, with its level, in teaching order
 * (not yet sorted by level). Computed once.
 */
export function numberCardCatalog(): NumberCardInfo[] {
  if (!catalog) {
    catalog = [];
    for (const [drill, facets] of candidates()) {
      const level = cardLevel(drill, facets);
      const { card, skill } = cardOf(drill, ...facets);
      if (level) catalog.push({ id: card, skill, level });
    }
  }
  return catalog;
}

/**
 * One exercise for exactly this card, deterministic in `seed`, or null for an
 * id the loaded lexicon can't build. Words and frames are capped at the card's
 * own level, so an A1 card never shows a B2 noun.
 */
export function buildNumberCard(
  card: string,
  seed: number,
  answerMode: AnswerMode = "typing",
): Exercise | null {
  const info = numberCardCatalog().find((c) => c.id === card);
  if (!info) return null;
  const [drill, head, kase] = card.slice("numbers:".length).split("|") as [NumberDrill, string, Case];
  const rng = makeRng(seed);
  const level = info.level;
  const taken = new Set<string>();

  if (drill === "spell") {
    const [lo, hi] = SPELL_SPANS[head as SpellMagnitude];
    // near misses stay at or below the magnitude's top: no "sto osiem" next to "osiem"
    return spellExercise(lo + Math.floor(rng() * (hi - lo + 1)), hi, answerMode, rng);
  }

  if (drill === "count") {
    const band = head as CountBand;
    const n = pick(bandNumbers(band), rng);
    const nouns = lexicon(undefined, level).filter((noun) => countBand(n, noun.gender) === band);
    const frames = COUNT_TEMPLATES.filter((t) => t.case === kase);
    const exercise = buildCountExercise(n, nouns, rng, taken, frames);
    if (exercise && answerMode === "choice") {
      const options = buildOptions(exercise, rng);
      if (options.length > 1) exercise.options = options;
    }
    return exercise;
  }

  if (drill === "numeral") {
    const cls = head as NumeralClass;
    const n = pick(classNumbers(cls), rng);
    const nouns = lexicon(undefined, level).filter((noun) => numeralClass(n, noun.gender, kase) === cls);
    return buildNumeralExercise(n, kase, nouns, answerMode, rng, taken);
  }

  if (head === "date") return buildDateExercise(answerMode, rng, taken);
  if (head === "time") return buildTimeExercise(answerMode, rng, taken, kase as "nom" | "loc");
  return buildOrdinalAgreement(kase, lexicon(undefined, level), answerMode, rng, taken, level);
}
