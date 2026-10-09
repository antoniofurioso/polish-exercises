import { CASE_INFO } from "./cases";
import { declineAdjective } from "./declineAdjective";
import { normalise, stripDiacritics } from "./grade";
import { nounVariants } from "./nouns";
import { declinePossessive } from "./possessives";
import { declineDemonstrative } from "./pronouns";
import type { Demonstrative } from "./pronouns";
import { CASES, POSSESSIVES, PRONOUN_CASES } from "./types";
import type { Adjective, Case, Exercise, Gender, GramNumber, MissKind, Noun, Possessive } from "./types";

/** Why an answer missed, and what to tell the learner (null text: nothing beyond the correct sentence). */
export type Diagnosis = { kind: MissKind; text: string | null };

/**
 * Works out *why* an answer is wrong — wrong case, wrong number, wrong gender
 * agreement, right word with the wrong ending — so the learner gets more than
 * the correct form thrown back at them. Missing diacritics are graded
 * separately and never reach here.
 */

const NUMBERS: GramNumber[] = ["sg", "pl"];
const GENDERS: Gender[] = ["mPers", "mAnim", "mInanim", "f", "n"];

const GENDER_EN: Record<Gender, string> = {
  mPers: "masculine",
  mAnim: "masculine",
  mInanim: "masculine",
  f: "feminine",
  n: "neuter",
};

type Cell = { kase: Case; number: GramNumber };

const q = (s: string) => `“${s}”`;
const numberEn = (n: GramNumber) => (n === "pl" ? "plural" : "singular");

/** "the genitive (dopełniacz)", or "the genitive or accusative" when syncretic. */
function caseNames(cases: Case[]): string {
  if (cases.length === 1) {
    return `the ${CASE_INFO[cases[0]].en.toLowerCase()} (${CASE_INFO[cases[0]].pl.toLowerCase()})`;
  }
  const names = cases.map((c) => CASE_INFO[c].en.toLowerCase());
  return `the ${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

const same = (a: string, b: string) => normalise(a) === normalise(b);
const sameLoose = (a: string, b: string) =>
  stripDiacritics(normalise(a)) === stripDiacritics(normalise(b));

/** One edit apart — swapped, doubled or dropped letters, not a grammar mistake. */
function isTypo(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  let j = 0;
  while (j < short.length - i && short[short.length - 1 - j] === long[long.length - 1 - j]) j++;
  const left = short.length - i - j;
  if (short.length !== long.length) return left === 0; // one letter added or dropped
  if (left <= 1) return true; // one letter mistyped
  return left === 2 && short[i] === long[i + 1] && short[i + 1] === long[i]; // swapped pair
}

/** The forms of one word across the whole paradigm, keyed by cell. */
type Paradigm = (cell: Cell) => string[];

function nounParadigm(noun: Noun): Paradigm {
  return ({ kase, number }) => nounVariants(noun, number, kase);
}

function adjParadigm(adj: Adjective, gender: Gender): Paradigm {
  return ({ kase, number }) => [declineAdjective(adj, gender, number, kase)];
}

/**
 * Every cell of the paradigm the given word could be, the target number first.
 * The target cell itself is skipped — if the word landed there it wasn't wrong.
 */
function cellsMatching(word: string, paradigm: Paradigm, want: Cell): Cell[] {
  const hits: Cell[] = [];
  for (const number of [want.number, ...NUMBERS.filter((n) => n !== want.number)]) {
    for (const kase of CASES) {
      if (kase === want.kase && number === want.number) continue;
      if (paradigm({ kase, number }).some((form) => same(form, word))) {
        hits.push({ kase, number });
      }
    }
  }
  return hits;
}

/**
 * The accusative trips learners up in one specific way: masculine inanimates
 * copy the nominative, masculine animates copy the genitive.
 */
function animacySlip(hits: Cell[], gender: Gender, want: Cell): "inanimate" | "animate" | null {
  if (want.kase !== "acc" || want.number !== "sg") return null;
  const got = hits.find((h) => h.number === "sg");
  if (!got) return null;
  if (gender === "mInanim" && got.kase === "gen") return "inanimate";
  if ((gender === "mAnim" || gender === "mPers") && got.kase === "nom") return "animate";
  return null;
}

function accusativeNote(hits: Cell[], noun: Noun, want: Cell): string | null {
  const slip = animacySlip(hits, noun.gender, want);
  if (slip === "inanimate") {
    return `an inanimate masculine like ${q(noun.lemma)} keeps its nominative form in the accusative`;
  }
  if (slip === "animate") {
    return `an animate masculine like ${q(noun.lemma)} borrows the genitive form in the accusative`;
  }
  return null;
}


/** A miss as the weak-spots view counts it, with the line the learner reads. */
type Miss = { kind: MissKind; text: string };

/** Which of case and number a paradigm hit got wrong (as `cellMiss` words it). */
function cellKind(hits: Cell[], want: Cell): MissKind {
  const number = hits[0].number;
  const cases = hits.filter((h) => h.number === number).map((h) => h.kase);
  const caseWrong = !cases.includes(want.kase);
  const numberWrong = number !== want.number;
  return caseWrong && numberWrong ? "caseNumber" : caseWrong ? "case" : "number";
}

/** "…is the genitive; this sentence wants the instrumental." */
function cellMiss(word: string, hits: Cell[], want: Cell): string {
  const number = hits[0].number;
  const cases = hits.filter((h) => h.number === number).map((h) => h.kase);
  const caseWrong = !cases.includes(want.kase);
  const numberWrong = number !== want.number;
  // the target case is named in the header already, so keep it short here
  const target = `the ${CASE_INFO[want.kase].en.toLowerCase()}`;

  if (caseWrong && numberWrong) {
    return `${q(word)} is ${caseNames(cases)} ${numberEn(number)}; here you need ${target} ${numberEn(
      want.number,
    )}.`;
  }
  if (caseWrong) return `${q(word)} is ${caseNames(cases)}; here you need ${target}.`;
  return `${q(word)} is the ${numberEn(number)} — this sentence is about ${
    want.number === "pl" ? "more than one" : "just one"
  }.`;
}

/** A paradigm hit as a miss: the accusative animacy slip, or a case / number one. */
function hitMiss(word: string, hits: Cell[], want: Cell, note: string | null, otherwise = ""): Miss {
  return {
    kind: note ? "accAnimacy" : cellKind(hits, want),
    text: `${cellMiss(word, hits, want)}${note ? ` Remember: ${note}.` : otherwise}`,
  };
}

/** Falls back to shape: same stem, wrong ending — or not a form of the word at all. */
function shapeMiss(word: string, expected: string, lemma: string): Miss {
  let i = 0;
  while (i < word.length && i < expected.length && word[i] === expected[i]) i++;
  // a divergence right at the start is fingers, not grammar; further in it's the ending
  if (i < 2 && isTypo(word, expected)) {
    return { kind: "typo", text: `Just a slip — ${q(expected)} is one letter away.` };
  }
  if (i >= 2) {
    const got = word.slice(i);
    const want = expected.slice(i);
    if (!got) return { kind: "ending", text: `${q(word)} is missing its ending — it needs -${want}.` };
    if (!want) return { kind: "ending", text: `${q(word)} has an ending too many — it stops at ${q(expected)}.` };
    return { kind: "ending", text: `Right word, wrong ending: -${got} instead of -${want}.` };
  }
  return { kind: "other", text: `${q(word)} isn't a form of ${q(lemma)} — the form here is ${q(expected)}.` };
}

function nounMiss(word: string, expected: string, noun: Noun, want: Cell): Miss {
  const hits = cellsMatching(word, nounParadigm(noun), want);
  if (hits.length > 0) return hitMiss(word, hits, want, accusativeNote(hits, noun, want));
  return shapeMiss(word, expected, noun.lemma);
}

function adjMiss(
  word: string,
  expected: string,
  adj: Adjective,
  noun: Noun,
  want: Cell,
): Miss {
  // the right slot but agreeing with the wrong gender is the classic miss
  const wrongGender = GENDERS.filter(
    (g) => g !== noun.gender && same(declineAdjective(adj, g, want.number, want.kase), word),
  );
  if (wrongGender.length > 0 && GENDER_EN[wrongGender[0]] !== GENDER_EN[noun.gender]) {
    return {
      kind: "gender",
      text: `${q(word)} is the ${GENDER_EN[wrongGender[0]]} form, but ${q(noun.lemma)} is ${
        GENDER_EN[noun.gender]
      } — ${q(expected)}.`,
    };
  }

  const hits = cellsMatching(word, adjParadigm(adj, noun.gender), want);
  if (hits.length > 0) {
    return hitMiss(
      word,
      hits,
      want,
      accusativeNote(hits, noun, want),
      ` The adjective copies ${q(noun.lemma)}: ${q(expected)}.`,
    );
  }
  return shapeMiss(word, expected, adj.lemma);
}

/** Which blank belongs to which word: the adjective always comes first. */
function slotKinds(ex: Exercise): ("adj" | "noun")[] {
  const hasAdj = Boolean(ex.source?.adj);
  return ex.tokens.flatMap((t, i) => (t.blank ? [hasAdj && i === 0 ? "adj" : "noun"] : []));
}

/** The whole blank as it would look in another cell of the paradigm. */
function phraseAt(ex: Exercise, kinds: ("adj" | "noun")[], cell: Cell): string | null {
  const { noun, adj } = ex.source!;
  const words: string[] = [];
  for (const kind of kinds) {
    if (kind === "adj") {
      if (!adj) return null;
      words.push(declineAdjective(adj, noun.gender, cell.number, cell.kase));
    } else {
      const form = nounVariants(noun, cell.number, cell.kase)[0];
      if (!form) return null;
      words.push(form);
    }
  }
  return words.join(" ");
}

/** A wrong answer to a case-drill question, whose words are known (`ex.source`). */
function diagnoseWords(given: string, ex: Exercise): Diagnosis | null {
  const { noun, adj } = ex.source!;
  if (!given) return { kind: "empty", text: "Nothing typed — the answer goes in the blank." };
  if (ex.answers.some((a) => same(a, given))) return null;

  const kinds = slotKinds(ex);
  const expected = ex.tokens.filter((t) => t.blank).map((t) => t.text);
  const want: Cell = { kase: ex.case, number: ex.number };

  // the whole phrase declined into some other cell: one explanation covers it
  const wholeHits = cellsMatching(
    given,
    (cell) => {
      const phrase = phraseAt(ex, kinds, cell);
      return phrase ? [phrase] : [];
    },
    want,
  );
  if (wholeHits.length > 0) return hitMiss(given, wholeHits, want, accusativeNote(wholeHits, noun, want));

  const words = given.split(" ");
  if (words.length !== expected.length) {
    if (words.length < expected.length) {
      return { kind: "wordCount", text: "Both words change here — the adjective and the noun." };
    }
    const only = kinds[0] === "adj" ? "adjective" : "noun";
    return { kind: "wordCount", text: `Only the ${only} goes in the blank — ${q(expected.join(" "))}.` };
  }

  const misses: Miss[] = [];
  for (const [i, word] of words.entries()) {
    if (sameLoose(word, expected[i])) continue;
    misses.push(
      kinds[i] === "adj" && adj
        ? adjMiss(word, expected[i], adj, noun, want)
        : nounMiss(word, expected[i], noun, want),
    );
  }
  // only diacritics apart: graded separately, nothing to explain
  if (misses.length === 0) return { kind: "typo", text: null };
  return { kind: misses[0].kind, text: misses.map((m) => m.text).join(" ") };
}

/**
 * The agreeing word's paradigm and the noun's gender, read off the card of a
 * demonstrative or possessive question (lib/cards/pronouns.ts, possessives.ts).
 */
function agreementOf(ex: Exercise): {
  form: (g: Gender, n: GramNumber, k: Case) => string;
  gender: Gender;
  /** True when the word is another possessor's form ("jego" for "jej"). */
  otherOwner?: (word: string, n: GramNumber, k: Case) => boolean;
} | null {
  const [drill, rest = ""] = (ex.card ?? "").split(":");
  const parts = rest.split("|");
  if (drill === "pronouns") {
    const gender = parts[1] as Gender;
    if (!GENDERS.includes(gender)) return null;
    const base: Demonstrative = ex.answers[0]?.startsWith("tam") ? "tamten" : "ten";
    return { form: (g, n, k) => declineDemonstrative(base, g, n, k), gender };
  }
  if (drill === "possessives") {
    const owner = parts[0] as Possessive;
    const gender = parts[2] as Gender;
    if (!POSSESSIVES.includes(owner) || !GENDERS.includes(gender)) return null;
    const otherOwner = (word: string, n: GramNumber, k: Case) =>
      POSSESSIVES.some((o) => o !== owner && same(declinePossessive(o, gender, n, k), word));
    return { form: (g, n, k) => declinePossessive(owner, g, n, k), gender, otherOwner };
  }
  return null;
}

/**
 * A wrong ten / tamten / possessive, classified against its own paradigm: the
 * right gender in another cell (case, number, the accusative animacy slip),
 * the right cell of another gender, or a mangled ending. No text: the note on
 * the exercise already spells out the agreement.
 */
function diagnoseAgreement(given: string, ex: Exercise): Diagnosis | null {
  const agreement = agreementOf(ex);
  if (!agreement) return null;
  const { form, gender } = agreement;
  if (given.split(" ").length !== 1) return { kind: "wordCount", text: null };
  const want: Cell = { kase: ex.case, number: ex.number };

  const paradigm: Paradigm = ({ kase, number }) =>
    (PRONOUN_CASES as readonly Case[]).includes(kase) ? [form(gender, number, kase)] : [];
  const hits = cellsMatching(given, paradigm, want);
  const ownCell = (): Diagnosis => ({ kind: animacySlip(hits, gender, want) ? "accAnimacy" : cellKind(hits, want), text: null });
  // another case in the right number first; then the right cell of another gender
  // ("naszym" for naszą is the masculine, before it is a dative plural)
  if (hits.length > 0 && hits[0].number === want.number) return ownCell();
  if (GENDERS.some((g) => g !== gender && same(form(g, want.number, want.kase), given))) {
    return { kind: "gender", text: null };
  }
  if (hits.length > 0) return ownCell();
  // the wrong owner altogether is not a grammar slip the paradigm can name
  if (agreement.otherOwner?.(given, want.number, want.kase)) return { kind: "other", text: null };
  return { kind: shapeMiss(given, ex.answers[0] ?? "", "").kind, text: null };
}

/**
 * Why an answer is wrong, as a MissKind the weak-spots view can count, with
 * the one-line explanation the learner reads (null when there is nothing more
 * to say than the correct sentence). Null when the answer is right.
 * Case-drill questions get both; demonstrative and possessive questions a
 * kind from their paradigm and no text; any other drill only "empty" / "other".
 */
export function diagnoseMiss(input: string, ex: Exercise): Diagnosis | null {
  const given = normalise(input);
  if (ex.source) return diagnoseWords(given, ex);
  if (!given) return { kind: "empty", text: null };
  if (ex.answers.some((a) => same(a, given))) return null;
  return diagnoseAgreement(given, ex) ?? { kind: "other", text: null };
}

/**
 * A one-line explanation of a wrong answer, or null when nothing useful can be
 * said beyond showing the correct sentence.
 */
export function explainMiss(input: string, ex: Exercise): string | null {
  if (!ex.source) return null;
  return diagnoseMiss(input, ex)?.text ?? null;
}
