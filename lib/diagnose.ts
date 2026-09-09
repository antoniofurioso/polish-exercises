import { CASE_INFO } from "./cases";
import { declineAdjective } from "./declineAdjective";
import { normalise, stripDiacritics } from "./grade";
import { nounVariants } from "./nouns";
import { CASES } from "./types";
import type { Adjective, Case, Exercise, Gender, GramNumber, Noun } from "./types";

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
function accusativeNote(hits: Cell[], noun: Noun, want: Cell): string | null {
  if (want.kase !== "acc" || want.number !== "sg") return null;
  const got = hits.find((h) => h.number === "sg");
  if (!got) return null;
  if (noun.gender === "mInanim" && got.kase === "gen") {
    return `an inanimate masculine like ${q(noun.lemma)} keeps its nominative form in the accusative`;
  }
  if ((noun.gender === "mAnim" || noun.gender === "mPers") && got.kase === "nom") {
    return `an animate masculine like ${q(noun.lemma)} borrows the genitive form in the accusative`;
  }
  return null;
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

/** Falls back to shape: same stem, wrong ending — or not a form of the word at all. */
function shapeMiss(word: string, expected: string, lemma: string): string {
  let i = 0;
  while (i < word.length && i < expected.length && word[i] === expected[i]) i++;
  // a divergence right at the start is fingers, not grammar; further in it's the ending
  if (i < 2 && isTypo(word, expected)) return `Just a slip — ${q(expected)} is one letter away.`;
  if (i >= 2) {
    const got = word.slice(i);
    const want = expected.slice(i);
    if (!got) return `${q(word)} is missing its ending — it needs -${want}.`;
    if (!want) return `${q(word)} has an ending too many — it stops at ${q(expected)}.`;
    return `Right word, wrong ending: -${got} instead of -${want}.`;
  }
  return `${q(word)} isn't a form of ${q(lemma)} — the form here is ${q(expected)}.`;
}

function nounMiss(word: string, expected: string, noun: Noun, want: Cell): string {
  const hits = cellsMatching(word, nounParadigm(noun), want);
  if (hits.length > 0) {
    const note = accusativeNote(hits, noun, want);
    return `${cellMiss(word, hits, want)}${note ? ` Remember: ${note}.` : ""}`;
  }
  return shapeMiss(word, expected, noun.lemma);
}

function adjMiss(
  word: string,
  expected: string,
  adj: Adjective,
  noun: Noun,
  want: Cell,
): string {
  // the right slot but agreeing with the wrong gender is the classic miss
  const wrongGender = GENDERS.filter(
    (g) => g !== noun.gender && same(declineAdjective(adj, g, want.number, want.kase), word),
  );
  if (wrongGender.length > 0 && GENDER_EN[wrongGender[0]] !== GENDER_EN[noun.gender]) {
    return `${q(word)} is the ${GENDER_EN[wrongGender[0]]} form, but ${q(noun.lemma)} is ${
      GENDER_EN[noun.gender]
    } — ${q(expected)}.`;
  }

  const hits = cellsMatching(word, adjParadigm(adj, noun.gender), want);
  if (hits.length > 0) {
    const note = accusativeNote(hits, noun, want);
    const tail = note ? ` Remember: ${note}.` : ` The adjective copies ${q(noun.lemma)}: ${q(expected)}.`;
    return `${cellMiss(word, hits, want)}${tail}`;
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

/**
 * A one-line explanation of a wrong answer, or null when nothing useful can be
 * said beyond showing the correct sentence.
 */
export function explainMiss(input: string, ex: Exercise): string | null {
  if (!ex.source) return null;
  const { noun, adj } = ex.source;
  const given = normalise(input);
  if (!given) return "Nothing typed — the answer goes in the blank.";
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
  if (wholeHits.length > 0) {
    const note = accusativeNote(wholeHits, noun, want);
    const tail = note ? ` Remember: ${note}.` : "";
    return `${cellMiss(given, wholeHits, want)}${tail}`;
  }

  const words = given.split(" ");
  if (words.length !== expected.length) {
    if (words.length < expected.length) {
      return "Both words change here — the adjective and the noun.";
    }
    const only = kinds[0] === "adj" ? "adjective" : "noun";
    return `Only the ${only} goes in the blank — ${q(expected.join(" "))}.`;
  }

  const messages: string[] = [];
  for (const [i, word] of words.entries()) {
    if (sameLoose(word, expected[i])) continue;
    messages.push(
      kinds[i] === "adj" && adj
        ? adjMiss(word, expected[i], adj, noun, want)
        : nounMiss(word, expected[i], noun, want),
    );
  }
  return messages.length > 0 ? messages.join(" ") : null;
}
