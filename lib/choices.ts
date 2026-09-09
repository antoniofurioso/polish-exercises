import { declineAdjective } from "./declineAdjective";
import { normalise, stripDiacritics } from "./grade";
import { nounVariants } from "./nouns";
import { CASES } from "./types";
import type { Adjective, Case, Exercise, GramNumber, Noun } from "./types";

/**
 * Multiple-choice distractors. Every option is the *same* word in a different
 * cell of its own paradigm, so picking one is a decision about the case ending
 * rather than about vocabulary.
 */

const NUMBERS: GramNumber[] = ["sg", "pl"];

/** What the blank covers, read back off the tokens. */
type Shape = "noun" | "adj" | "both";

function shapeOf(ex: Exercise): Shape {
  const blanks = ex.tokens.filter((t) => t.blank).length;
  if (ex.tokens.length === 1) return "noun";
  return blanks === 2 ? "both" : "adj";
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The string that would sit in the blank if the exercise asked for this cell. */
function renderCell(
  shape: Shape,
  noun: Noun,
  adj: Adjective | undefined,
  number: GramNumber,
  kase: Case,
): string | null {
  const nounText = nounVariants(noun, number, kase)[0];
  if (shape === "noun") return nounText ?? null;
  if (!adj) return null;
  const adjText = declineAdjective(adj, noun.gender, number, kase);
  if (shape === "adj") return adjText;
  return nounText ? `${adjText} ${nounText}` : null;
}

/**
 * Builds the option list for one exercise: the right answer plus up to
 * `count - 1` distractors, shuffled. Returns [] when the paradigm is too
 * syncretic to offer a real choice — the caller falls back to typing.
 */
export function buildOptions(ex: Exercise, rng: () => number, count = 4): string[] {
  if (!ex.source) return [];
  const { noun, adj } = ex.source;
  const shape = shapeOf(ex);
  const correct = ex.answers[0];

  const taken = new Set(ex.answers.map((a) => stripDiacritics(normalise(a))));
  // same-number cells first: they isolate the case, which is what is being drilled
  const near: string[] = [];
  const far: string[] = [];

  for (const number of NUMBERS) {
    if (number === "pl" && (noun.noPlural || !noun.pl)) continue;
    for (const kase of CASES) {
      if (number === ex.number && kase === ex.case) continue;
      const text = renderCell(shape, noun, adj, number, kase);
      if (!text) continue;
      const key = stripDiacritics(normalise(text));
      if (taken.has(key)) continue;
      taken.add(key);
      (number === ex.number ? near : far).push(text);
    }
  }

  const distractors = [...shuffle(near, rng), ...shuffle(far, rng)].slice(0, count - 1);
  if (distractors.length < 1) return [];
  return shuffle([correct, ...distractors], rng);
}
