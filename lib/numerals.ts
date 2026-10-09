import { declineAdjective } from "./declineAdjective";
import type { AdjectiveStem } from "./declineAdjective";
import type { Case, Gender, GramNumber } from "./types";

/**
 * Polish numerals: the words themselves, how they decline, and — the part
 * learners actually trip over — which case and number the counted noun has to
 * land in after them.
 */

// ---------------------------------------------------------------- cardinals

const UNITS = [
  "zero", "jeden", "dwa", "trzy", "cztery", "pięć", "sześć", "siedem", "osiem", "dziewięć",
  "dziesięć", "jedenaście", "dwanaście", "trzynaście", "czternaście", "piętnaście",
  "szesnaście", "siedemnaście", "osiemnaście", "dziewiętnaście",
];

const TENS = [
  "", "", "dwadzieścia", "trzydzieści", "czterdzieści", "pięćdziesiąt",
  "sześćdziesiąt", "siedemdziesiąt", "osiemdziesiąt", "dziewięćdziesiąt",
];

const HUNDREDS = [
  "", "sto", "dwieście", "trzysta", "czterysta", "pięćset",
  "sześćset", "siedemset", "osiemset", "dziewięćset",
];

/** Spells a number 0-9999 out in Polish: 247 -> "dwieście czterdzieści siedem". */
export function cardinal(n: number): string {
  if (n < 0 || n > 9999 || !Number.isInteger(n)) throw new RangeError(`out of range: ${n}`);
  if (n < 20) return UNITS[n];
  if (n < 100) {
    const rest = n % 10;
    return rest ? `${TENS[Math.floor(n / 10)]} ${UNITS[rest]}` : TENS[Math.floor(n / 10)];
  }
  if (n < 1000) {
    const rest = n % 100;
    return rest ? `${HUNDREDS[Math.floor(n / 100)]} ${cardinal(rest)}` : HUNDREDS[Math.floor(n / 100)];
  }
  const thousands = Math.floor(n / 1000);
  // "tysiąc" is counted like any other masculine noun: 2 tysiące, 5 tysięcy
  const word =
    thousands === 1
      ? "tysiąc"
      : `${cardinal(thousands)} ${government(thousands, "mInanim") === "nomPl" ? "tysiące" : "tysięcy"}`;
  const rest = n % 1000;
  return rest ? `${word} ${cardinal(rest)}` : word;
}

// ------------------------------------------------------------- the -u forms

/**
 * Outside the nominative, 2 and up collapse onto a single oblique form ending
 * in -u (-ch for 2, 3, 4). The same form serves as the nominative when what is
 * being counted is masculine-personal: "pięciu studentów".
 */
const OBLIQUE_UNITS: Record<number, string> = {
  2: "dwóch", 3: "trzech", 4: "czterech", 5: "pięciu", 6: "sześciu", 7: "siedmiu",
  8: "ośmiu", 9: "dziewięciu", 10: "dziesięciu", 11: "jedenastu", 12: "dwunastu",
  13: "trzynastu", 14: "czternastu", 15: "piętnastu", 16: "szesnastu",
  17: "siedemnastu", 18: "osiemnastu", 19: "dziewiętnastu",
};

const OBLIQUE_TENS: Record<number, string> = {
  2: "dwudziestu", 3: "trzydziestu", 4: "czterdziestu", 5: "pięćdziesięciu",
  6: "sześćdziesięciu", 7: "siedemdziesięciu", 8: "osiemdziesięciu", 9: "dziewięćdziesięciu",
};

const OBLIQUE_HUNDREDS: Record<number, string> = {
  1: "stu", 2: "dwustu", 3: "trzystu", 4: "czterystu", 5: "pięciuset",
  6: "sześciuset", 7: "siedmiuset", 8: "ośmiuset", 9: "dziewięciuset",
};

/** The -u form of 2-999; "jeden" never changes inside a compound. */
export function obliqueCardinal(n: number): string {
  if (n < 1 || n > 999 || !Number.isInteger(n)) throw new RangeError(`out of range: ${n}`);
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  if (hundreds) parts.push(OBLIQUE_HUNDREDS[hundreds]);
  const rest = n % 100;
  if (rest >= 20) {
    parts.push(OBLIQUE_TENS[Math.floor(rest / 10)]);
    const unit = rest % 10;
    if (unit) parts.push(unit === 1 ? "jeden" : OBLIQUE_UNITS[unit]);
  } else if (rest === 1) {
    parts.push(n === 1 ? "jednego" : "jeden");
  } else if (rest > 1) {
    parts.push(OBLIQUE_UNITS[rest]);
  }
  return parts.join(" ");
}

/** The instrumental of 5 and up: pięciu -> pięcioma, dwudziestu -> dwudziestoma. */
const withOma = (oblique: string) =>
  oblique
    .split(" ")
    // "jeden" and the hundreds (pięciuset) sit out the instrumental ending
    .map((w) => (w === "jeden" || w.endsWith("set") ? w : w.replace(/u$/, "oma")))
    .join(" ");

// ------------------------------------------------------------- what follows

/** The case and number the counted noun takes. */
export type Government = "nomSg" | "nomPl" | "genPl";

/**
 * 1 takes the nominative singular; 2, 3, 4 (but not 12, 13, 14, and not with
 * men) take the nominative plural; everything else takes the genitive plural.
 */
export function government(n: number, gender: Gender): Government {
  if (n === 1) return "nomSg";
  const last1 = n % 10;
  const last2 = n % 100;
  const small = last1 >= 2 && last1 <= 4 && !(last2 >= 12 && last2 <= 14);
  if (!small) return "genPl";
  return gender === "mPers" ? "genPl" : "nomPl";
}

export const GOVERNMENT_CELL: Record<Government, { case: Case; number: GramNumber }> = {
  nomSg: { case: "nom", number: "sg" },
  nomPl: { case: "nom", number: "pl" },
  genPl: { case: "gen", number: "pl" },
};

// ------------------------------------------------------- the numeral itself

/** jeden: declined from its stem like an adjective. */
const JEDEN: AdjectiveStem = {
  stem: "jedn",
  type: "hard",
  virilePl: "jedni",
};

/** "jeden" declines like an adjective, apart from its bare nominative forms. */
function declineJeden(gender: Gender, kase: Case): string {
  const bare = gender === "f" ? "jedna" : gender === "n" ? "jedno" : "jeden";
  if (kase === "nom" || kase === "voc") return bare;
  if (kase === "acc") {
    if (gender === "f") return "jedną";
    if (gender === "mPers" || gender === "mAnim") return "jednego";
    return bare; // inanimate masculine and neuter copy the nominative
  }
  return declineAdjective(JEDEN, gender, "sg", kase);
}

/** The form a numeral takes in the nominative (and, for counting, accusative). */
export function countingNumeral(n: number, gender: Gender): string {
  if (n === 1) return declineJeden(gender, "nom");
  if (gender === "mPers") return obliqueCardinal(n);
  const word = cardinal(n);
  // 2 -> dwie in front of feminines: "dwie kobiety", "dwadzieścia dwie kobiety"
  return gender === "f" && n % 10 === 2 && n % 100 !== 12
    ? word.replace(/dwa$/, "dwie")
    : word;
}

/**
 * Every accepted form of a numeral in one case, the one to teach first.
 * Numbers above 999 are not declined here — they only turn up in the spelling
 * drill, where no case is involved.
 */
export function declineNumeral(n: number, gender: Gender, kase: Case): string[] {
  if (n === 1) return [declineJeden(gender, kase)];

  if (kase === "nom" || kase === "voc") return [countingNumeral(n, gender)];
  if (kase === "acc") {
    // counted objects keep the nominative shape; men take the -u form
    return [countingNumeral(n, gender)];
  }

  const oblique = obliqueCardinal(n);
  const last1 = n % 10;
  const last2 = n % 100;
  const small = last1 >= 2 && last1 <= 4 && !(last2 >= 12 && last2 <= 14);

  if (kase === "gen" || kase === "loc") return [oblique];

  if (kase === "dat") {
    if (!small) return [oblique];
    const dative: Record<number, string> = { 2: "dwóm", 3: "trzem", 4: "czterem" };
    return [replaceLast(oblique, dative[last1])];
  }

  // instrumental
  if (!small) {
    const oma = withOma(oblique);
    // the hundreds have no -oma form, so the two spellings collapse into one
    return oma === oblique ? [oblique] : [oma, oblique];
  }
  const instrumental: Record<number, string> = { 2: "dwoma", 3: "trzema", 4: "czterema" };
  const base = replaceLast(oblique, instrumental[last1]);
  // "dwiema kobietami" is the feminine form, with "dwoma" accepted alongside it
  if (last1 === 2 && gender === "f") return [replaceLast(oblique, "dwiema"), base];
  return [base];
}

/** Swaps the final word of a compound numeral, leaving "dwudziestu ..." alone. */
function replaceLast(phrase: string, word: string): string {
  const parts = phrase.split(" ");
  parts[parts.length - 1] = word;
  return parts.join(" ");
}

// -------------------------------------------------------------- ordinals

type OrdinalStem = AdjectiveStem & { lemma: string };

const ORDINALS: Record<number, OrdinalStem> = {
  1: { lemma: "pierwszy", stem: "pierwsz", type: "hard", virilePl: "pierwsi" },
  2: { lemma: "drugi", stem: "drug", type: "velar", virilePl: "drudzy" },
  3: { lemma: "trzeci", stem: "trzec", type: "soft", virilePl: "trzeci" },
  4: { lemma: "czwarty", stem: "czwart", type: "hard", virilePl: "czwarci" },
  5: { lemma: "piąty", stem: "piąt", type: "hard", virilePl: "piąci" },
  6: { lemma: "szósty", stem: "szóst", type: "hard", virilePl: "szóści" },
  7: { lemma: "siódmy", stem: "siódm", type: "hard", virilePl: "siódmi" },
  8: { lemma: "ósmy", stem: "ósm", type: "hard", virilePl: "ósmi" },
  9: { lemma: "dziewiąty", stem: "dziewiąt", type: "hard", virilePl: "dziewiąci" },
  10: { lemma: "dziesiąty", stem: "dziesiąt", type: "hard", virilePl: "dziesiąci" },
  11: { lemma: "jedenasty", stem: "jedenast", type: "hard", virilePl: "jedenaści" },
  12: { lemma: "dwunasty", stem: "dwunast", type: "hard", virilePl: "dwunaści" },
  13: { lemma: "trzynasty", stem: "trzynast", type: "hard", virilePl: "trzynaści" },
  14: { lemma: "czternasty", stem: "czternast", type: "hard", virilePl: "czternaści" },
  15: { lemma: "piętnasty", stem: "piętnast", type: "hard", virilePl: "piętnaści" },
  16: { lemma: "szesnasty", stem: "szesnast", type: "hard", virilePl: "szesnaści" },
  17: { lemma: "siedemnasty", stem: "siedemnast", type: "hard", virilePl: "siedemnaści" },
  18: { lemma: "osiemnasty", stem: "osiemnast", type: "hard", virilePl: "osiemnaści" },
  19: { lemma: "dziewiętnasty", stem: "dziewiętnast", type: "hard", virilePl: "dziewiętnaści" },
  20: { lemma: "dwudziesty", stem: "dwudziest", type: "hard", virilePl: "dwudziesci" },
  30: { lemma: "trzydziesty", stem: "trzydziest", type: "hard", virilePl: "trzydziesci" },
  40: { lemma: "czterdziesty", stem: "czterdziest", type: "hard", virilePl: "czterdziesci" },
  50: { lemma: "pięćdziesiąty", stem: "pięćdziesiąt", type: "hard", virilePl: "pięćdziesiąci" },
  60: { lemma: "sześćdziesiąty", stem: "sześćdziesiąt", type: "hard", virilePl: "sześćdziesiąci" },
  70: { lemma: "siedemdziesiąty", stem: "siedemdziesiąt", type: "hard", virilePl: "siedemdziesiąci" },
  80: { lemma: "osiemdziesiąty", stem: "osiemdziesiąt", type: "hard", virilePl: "osiemdziesiąci" },
  90: { lemma: "dziewięćdziesiąty", stem: "dziewięćdziesiąt", type: "hard", virilePl: "dziewięćdziesiąci" },
  100: { lemma: "setny", stem: "setn", type: "hard", virilePl: "setni" },
};

/** The ordinal's parts: only the last one or two words are ordinal in Polish. */
function ordinalParts(n: number): OrdinalStem[] {
  if (n < 1 || n > 100 || !Number.isInteger(n)) throw new RangeError(`out of range: ${n}`);
  if (ORDINALS[n]) return [ORDINALS[n]];
  const tens = Math.floor(n / 10) * 10;
  return [ORDINALS[tens], ORDINALS[n % 10]];
}

/** The lemma, for showing in a hint: 21 -> "dwudziesty pierwszy". */
export const ordinalLemma = (n: number): string =>
  ordinalParts(n).map((p) => p.lemma).join(" ");

/** An ordinal declined to agree with something: 12 + f + loc -> "dwunastej". */
export function ordinal(n: number, gender: Gender, number: GramNumber, kase: Case): string {
  return ordinalParts(n)
    .map((p) => declineAdjective(p, gender, number, kase))
    .join(" ");
}

// ----------------------------------------------------------------- calendar

/** Months as they appear in a date — "piątego maja" — and in a bare list. */
export const MONTHS: { nom: string; gen: string; en: string; days: number }[] = [
  { nom: "styczeń", gen: "stycznia", en: "January", days: 31 },
  { nom: "luty", gen: "lutego", en: "February", days: 28 },
  { nom: "marzec", gen: "marca", en: "March", days: 31 },
  { nom: "kwiecień", gen: "kwietnia", en: "April", days: 30 },
  { nom: "maj", gen: "maja", en: "May", days: 31 },
  { nom: "czerwiec", gen: "czerwca", en: "June", days: 30 },
  { nom: "lipiec", gen: "lipca", en: "July", days: 31 },
  { nom: "sierpień", gen: "sierpnia", en: "August", days: 31 },
  { nom: "wrzesień", gen: "września", en: "September", days: 30 },
  { nom: "październik", gen: "października", en: "October", days: 31 },
  { nom: "listopad", gen: "listopada", en: "November", days: 30 },
  { nom: "grudzień", gen: "grudnia", en: "December", days: 31 },
];

// ------------------------------------------------------------------ english

const EN_UNITS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];

const EN_TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];

const EN_ORDINALS = [
  "", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth",
  "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth",
  "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth",
];

/** English gloss for a number, used only to prompt the spelling drill. */
export function englishNumber(n: number): string {
  if (n < 20) return EN_UNITS[n];
  if (n < 100) {
    const rest = n % 10;
    return rest ? `${EN_TENS[Math.floor(n / 10)]}-${EN_UNITS[rest]}` : EN_TENS[Math.floor(n / 10)];
  }
  if (n < 1000) {
    const rest = n % 100;
    const head = `${EN_UNITS[Math.floor(n / 100)]} hundred`;
    return rest ? `${head} and ${englishNumber(rest)}` : head;
  }
  const rest = n % 1000;
  const head = `${englishNumber(Math.floor(n / 1000))} thousand`;
  return rest ? `${head} ${englishNumber(rest)}` : head;
}

/** English ordinal for a number up to 100: 21 -> "twenty-first". */
export function englishOrdinal(n: number): string {
  if (n <= 20) return EN_ORDINALS[n];
  if (n === 100) return "hundredth";
  const unit = n % 10;
  if (unit === 0) return `${EN_TENS[Math.floor(n / 10)].replace(/y$/, "ieth")}`;
  return `${EN_TENS[Math.floor(n / 10)]}-${EN_ORDINALS[unit]}`;
}
