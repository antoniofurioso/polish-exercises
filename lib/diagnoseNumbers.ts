import { normalise, stripDiacritics } from "./grade";
import { nounVariants } from "./nouns";
import { cardinal, declineNumeral, ordinal } from "./numerals";
import { CASES, GENDERS } from "./types";
import type { Exercise, Gender, GramNumber, MissKind, Noun } from "./types";

/**
 * Why a wrong answer to a numbers question was wrong (plans/phase-2.md §8),
 * read from the exercise's SRS card (`numbers:<drill>|…`, lib/cards/numbers.ts)
 * and what the builder in lib/numbers.ts put in it:
 *
 *   count    the blank is the counted noun, the numeral sits in the frame.
 *            Another real form of that noun → "government" (pięć koty, dwa kotów).
 *   numeral  the blank is the numeral, the noun is given. The same number in
 *            another gender or case (dwa for dwie, dwóch for dwaj, dwoma for
 *            dwóm), or the virile dwaj / trzej / czterej → "numeralForm".
 *   spell    a figure written out. Only "tysiąc" in the wrong form (dwa tysięcy)
 *            → "government"; otherwise "typo", "ending" or "other".
 *   ordinal  the same ordinal in another gender, number or case → "numeralForm".
 *
 * Every drill: nothing typed → "empty"; another number of words than the
 * answer → "wordCount"; one letter off → "typo"; the right stem with another
 * ending → "ending". Answers are compared without diacritics: a
 * diacritics-only slip is graded on its own and never reaches here.
 *
 * Null when the answer is right, the exercise is not a numbers card, or
 * nothing more specific than "other" can be said (the caller falls back to
 * `diagnoseMiss`); the spelling drill says "other" itself.
 */
export function diagnoseNumberMiss(input: string, ex: Exercise): MissKind | null {
  if (!ex.card?.startsWith("numbers:")) return null;
  const drill = ex.card.slice("numbers:".length).split("|")[0];
  const typed = loose(input);
  if (!typed) return "empty";
  const answers = ex.answers.map(loose);
  if (answers.includes(typed)) return null;

  const expected = answers[0] ?? "";
  if (words(typed).length !== words(expected).length) return "wordCount";

  const forms = alternatives(drill, ex);
  if (forms?.forms.has(typed)) return forms.kind;
  if (drill === "spell" && thousandSlip(typed, expected)) return "government";

  const shape = shapeOf(typed, expected);
  if (shape) return shape;
  return drill === "spell" ? "other" : null;
}

// ------------------------------------------------------------- the forms

/** The answer as compared: normalised, no diacritics. */
const loose = (s: string) => stripDiacritics(normalise(s));
const words = (s: string) => s.split(" ").filter(Boolean);

const NUMBERS: GramNumber[] = ["sg", "pl"];

/** The id's second field: the number drawn (`numeral|5|kot|gen`, `date|12|maj`, `time|3|loc`, `ord|7|…`). */
function drawnNumber(ex: Exercise): number | null {
  const n = Number(ex.id.split("|")[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The wrong-but-real forms a drill can tell apart, and what typing one of them means. */
function alternatives(drill: string, ex: Exercise): { forms: Set<string>; kind: MissKind } | null {
  if (drill === "count") {
    const noun = ex.source?.noun;
    return noun ? { forms: nounForms(noun), kind: "government" } : null;
  }
  const n = drawnNumber(ex);
  if (n === null) return null;
  if (drill === "numeral") return { forms: numeralForms(n), kind: "numeralForm" };
  if (drill === "ordinal" && n <= 100) return { forms: ordinalForms(n), kind: "numeralForm" };
  return null;
}

/** Every form of a noun, alternatives included. */
function nounForms(noun: Noun): Set<string> {
  const out = new Set<string>();
  for (const number of NUMBERS) {
    for (const kase of CASES) for (const form of nounVariants(noun, number, kase)) out.add(loose(form));
  }
  return out;
}

/** Every case and gender form of the numeral `n`, plus the virile dwaj / trzej / czterej. */
function numeralForms(n: number): Set<string> {
  const out = new Set<string>();
  for (const gender of GENDERS as readonly Gender[]) {
    for (const kase of CASES) for (const form of declineNumeral(n, gender, kase)) out.add(loose(form));
  }
  const virile = ["", "", "dwaj", "trzej", "czterej"][n];
  if (virile) out.add(virile);
  return out;
}

/** Every gender, number and case form of the ordinal `n`. */
function ordinalForms(n: number): Set<string> {
  const out = new Set<string>();
  for (const gender of GENDERS as readonly Gender[]) {
    for (const number of NUMBERS) for (const kase of CASES) out.add(loose(ordinal(n, gender, number, kase)));
  }
  return out;
}

const TYSIAC = ["tysiac", "tysiace", "tysiecy"];

/** "dwa tysięcy" for "dwa tysiące": every word right but tysiąc, in another of its counted forms. */
function thousandSlip(typed: string, expected: string): boolean {
  const got = words(typed);
  const want = words(expected);
  const off = want.flatMap((w, i) => (w === got[i] ? [] : [i]));
  return off.length === 1 && TYSIAC.includes(want[off[0]]) && TYSIAC.includes(got[off[0]]);
}

// ------------------------------------------------------------- the shape

/**
 * Typo or ending: one edit away from the answer is a typo; otherwise the first
 * word that differs decides — the right first letters with another ending is
 * "ending", unless the word typed is a real number word of its own (sześć for
 * szesnaście is another number, not an ending). Null when nothing fits.
 */
function shapeOf(typed: string, expected: string): MissKind | null {
  if (isTypo(typed, expected)) return "typo";
  const got = words(typed);
  const want = words(expected);
  const i = want.findIndex((w, k) => w !== got[k]);
  if (i < 0) return null;
  const [a, b] = [got[i], want[i]];
  if (numberWords().has(a)) return null;
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common++;
  return common >= 2 ? "ending" : null;
}

let vocabulary: Set<string> | null = null;

/** Every word a number up to 999 (and tysiąc) can be spelled, declined or ordered with. Built once. */
function numberWords(): Set<string> {
  if (!vocabulary) {
    vocabulary = new Set(TYSIAC);
    const add = (phrase: string) => words(loose(phrase)).forEach((w) => vocabulary!.add(w));
    for (let n = 0; n <= 999; n++) add(cardinal(n));
    for (let n = 1; n <= 999; n++) numeralForms(n).forEach(add);
    for (let n = 1; n <= 100; n++) ordinalForms(n).forEach(add);
  }
  return vocabulary;
}

/** One edit apart — swapped, doubled or dropped letters (as in lib/diagnose.ts). */
function isTypo(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  let j = 0;
  while (j < short.length - i && short[short.length - 1 - j] === long[long.length - 1 - j]) j++;
  const left = short.length - i - j;
  if (short.length !== long.length) return left === 0;
  if (left <= 1) return true;
  return left === 2 && short[i] === long[i + 1] && short[i + 1] === long[i];
}
