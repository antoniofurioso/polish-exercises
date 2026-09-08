import { ADJECTIVES } from "./adjectives";
import { declineAdjective } from "./declineAdjective";
import { NOUNS } from "./nouns";
import { TEMPLATES } from "./templates";
import { genderGroup } from "./types";
import type {
  Adjective,
  Case,
  Config,
  Exercise,
  GenderGroup,
  GramNumber,
  Noun,
  Template,
  Token,
  WordMode,
} from "./types";

/** Deterministic RNG so a session can be replayed from its seed. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const VOWELS = "aąeęioóuyAEIOUY";
const isConsonant = (ch: string) => !!ch && !VOWELS.includes(ch);

/**
 * "z" and "w" grow an -e in front of consonant clusters:
 * z psem / ze stołem, w wodzie / we wsi.
 */
export function resolvePrep(prep: "z" | "w", next: string): string {
  const word = next.toLowerCase();
  const [a, b] = [word[0] ?? "", word[1] ?? ""];
  if (prep === "z") return "szżśź".includes(a) && isConsonant(b) ? "ze" : "z";
  return "wf".includes(a) && isConsonant(b) ? "we" : "w";
}

function nounForm(noun: Noun, number: GramNumber, kase: Case): string {
  const table = number === "pl" ? noun.pl : noun.sg;
  return (table ?? noun.sg)[kase];
}

function nounAlts(noun: Noun, number: GramNumber, kase: Case): string[] {
  return noun.alt?.[`${number}.${kase}`] ?? [];
}

function fitsTemplate(noun: Noun, tpl: Template): boolean {
  return tpl.requires.length === 0 || noun.tags.some((t) => tpl.requires.includes(t));
}

function fitsNoun(adj: Adjective, noun: Noun): boolean {
  return !adj.fits || noun.tags.some((t) => adj.fits!.includes(t));
}

function templatesFor(kase: Case, number: GramNumber): Template[] {
  return TEMPLATES.filter((t) => t.case === kase && (t.number === "any" || t.number === number));
}

function nounsFor(tpl: Template, number: GramNumber, genders?: GenderGroup[]): Noun[] {
  return NOUNS.filter(
    (noun) =>
      fitsTemplate(noun, tpl) &&
      (number === "sg" || (!noun.noPlural && noun.pl !== undefined)) &&
      (!genders || genders.length === 0 || genders.includes(genderGroup(noun.gender))),
  );
}

function article(phrase: string): string {
  return VOWELS.includes(phrase[0]) ? "an" : "a";
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderEnglish(
  tpl: Template,
  noun: Noun,
  adj: Adjective | undefined,
  number: GramNumber,
): string {
  const head = number === "pl" ? noun.enPl : noun.en;
  const bare = adj ? `${adj.en} ${head}` : head;
  const indefinite =
    number === "pl" || noun.mass ? bare : `${article(bare)} ${bare}`;
  const text = (tpl.enPl && number === "pl" ? tpl.enPl : tpl.en)
    .replace(/\{npDef\}/g, `the ${bare}`)
    .replace(/\{npBare\}/g, bare)
    .replace(/\{np\}/g, indefinite);
  return capitalise(text);
}

function buildTokens(
  noun: Noun,
  adj: Adjective | undefined,
  number: GramNumber,
  kase: Case,
  mode: WordMode,
): Token[] {
  const nounText = nounForm(noun, number, kase);
  if (!adj) return [{ text: nounText, blank: true }];
  const adjText = declineAdjective(adj, noun.gender, number, kase);
  return [
    { text: adjText, blank: true },
    { text: nounText, blank: mode === "both" },
  ];
}

function buildAnswers(
  tokens: Token[],
  noun: Noun,
  adj: Adjective | undefined,
  number: GramNumber,
  kase: Case,
  mode: WordMode,
): string[] {
  const primary = tokens
    .filter((t) => t.blank)
    .map((t) => t.text)
    .join(" ");
  if (mode === "adjectives") return [primary];
  const variants = nounAlts(noun, number, kase);
  if (variants.length === 0) return [primary];
  const prefix = mode === "both" && adj ? `${tokens[0].text} ` : "";
  return [primary, ...variants.map((v) => prefix + v)];
}

type Pick = { tpl: Template; noun: Noun; adj?: Adjective };

function tryPick(
  kase: Case,
  number: GramNumber,
  mode: WordMode,
  rng: () => number,
  genders?: GenderGroup[],
): Pick | null {
  const templates = templatesFor(kase, number);
  if (templates.length === 0) return null;
  for (const tpl of shuffle(templates, rng)) {
    const nouns = nounsFor(tpl, number, genders);
    if (nouns.length === 0) continue;
    for (const noun of shuffle(nouns, rng)) {
      if (mode === "nouns") return { tpl, noun };
      const adjectives = ADJECTIVES.filter((a) => fitsNoun(a, noun));
      if (adjectives.length === 0) continue;
      return { tpl, noun, adj: pick(adjectives, rng) };
    }
  }
  return null;
}

export function buildExercise(
  kase: Case,
  numbers: GramNumber[],
  mode: WordMode,
  rng: () => number,
  taken: Set<string> = new Set(),
  genders?: GenderGroup[],
): Exercise | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const number = pick(numbers, rng);
    const chosen = tryPick(kase, number, mode, rng, genders);
    if (!chosen) continue;
    const { tpl, noun, adj } = chosen;
    const key = `${tpl.pl}|${noun.lemma}|${adj?.lemma ?? ""}|${number}`;
    if (taken.has(key) && attempt < 30) continue;
    taken.add(key);

    const tokens = buildTokens(noun, adj, number, kase, mode);
    const [before, after] = tpl.pl.split("{NP}");
    const resolvedBefore = before
      .replace(/\{z\}/g, resolvePrep("z", tokens[0].text))
      .replace(/\{w\}/g, resolvePrep("w", tokens[0].text));

    const hintParts = mode === "nouns"
      ? [noun.lemma]
      : mode === "adjectives"
        ? [adj!.lemma]
        : [adj!.lemma, noun.lemma];

    return {
      id: `${key}|${kase}`,
      case: kase,
      number,
      before: resolvedBefore,
      after,
      tokens,
      hint: hintParts.join(" "),
      en: renderEnglish(tpl, noun, adj, number),
      answers: buildAnswers(tokens, noun, adj, number, kase, mode),
      note: tpl.note,
    };
  }
  return null;
}

/** Builds a full session, spreading the selected cases evenly. */
export function buildSession(config: Config, seed = Date.now()): Exercise[] {
  const rng = makeRng(seed);
  const cases = config.cases.length ? config.cases : (["nom"] as Case[]);
  const numbers = config.numbers.length ? config.numbers : (["sg"] as GramNumber[]);
  const taken = new Set<string>();
  const exercises: Exercise[] = [];

  let pool: Case[] = [];
  for (let i = 0; i < config.count; i++) {
    if (pool.length === 0) pool = shuffle(cases, rng);
    const kase = pool.pop()!;
    const exercise = buildExercise(kase, numbers, config.mode, rng, taken, config.genders);
    if (exercise) exercises.push(exercise);
  }
  return exercises;
}

/** Renders the sentence with a single blank standing in for the whole gap. */
export function renderPrompt(ex: Exercise): string {
  const parts: string[] = [];
  for (const token of ex.tokens) {
    if (token.blank) {
      if (parts[parts.length - 1] !== "___") parts.push("___");
    } else {
      parts.push(token.text);
    }
  }
  return `${ex.before}${parts.join(" ")}${ex.after}`;
}

/** Renders the sentence with the correct answer filled in. */
export function renderSolution(ex: Exercise): string {
  const middle = ex.tokens.map((t) => t.text).join(" ");
  return `${ex.before}${middle}${ex.after}`;
}
