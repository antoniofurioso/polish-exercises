import { ADJECTIVES, COLLOCATIONS } from "./adjectives";
import { buildOptions } from "./choices";
import { declineAdjective } from "./declineAdjective";
import { NOUNS, nounVariants } from "./nouns";
import { TEMPLATES } from "./templates";
import { genderGroup, withinLevel } from "./types";
import type {
  Adjective,
  Case,
  Config,
  Exercise,
  GenderGroup,
  GramNumber,
  Level,
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

export function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
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
  // "sz" is one sound: z szefem, but ze szkołą
  if (prep === "z") {
    const next = word.startsWith("sz") ? (word[2] ?? "") : b;
    return "szżśź".includes(a) && isConsonant(next) ? "ze" : "z";
  }
  return "wf".includes(a) && isConsonant(b) ? "we" : "w";
}

export function nounForm(noun: Noun, number: GramNumber, kase: Case): string {
  return nounVariants(noun, number, kase)[0] ?? noun.sg[kase];
}

function nounAlts(noun: Noun, number: GramNumber, kase: Case): string[] {
  return nounVariants(noun, number, kase).slice(1);
}

export function fitsTemplate(
  noun: Noun,
  tpl: Pick<Template, "requires" | "lemmas" | "excludeLemmas">,
): boolean {
  if (tpl.excludeLemmas?.includes(noun.lemma)) return false;
  if (tpl.lemmas?.includes(noun.lemma)) return true;
  if (tpl.requires.length === 0) return !tpl.lemmas;
  return noun.tags.some((t) => tpl.requires.includes(t));
}

const isLiving = (noun: Noun) => noun.tags.includes("person") || noun.tags.includes("animal");

/** The adjectives that read naturally on this noun inside this sentence, up to `maxLevel` when set. */
export function adjectivesFor(noun: Noun, tpl: Template, maxLevel?: Level): Adjective[] {
  const natural = COLLOCATIONS[noun.lemma] ?? [];
  return ADJECTIVES.filter(
    (a) =>
      natural.includes(a.lemma) &&
      withinLevel(a, maxLevel) &&
      (tpl.adjOnly ? tpl.adjOnly.includes(a.lemma) : !a.address) &&
      // "Kocham chorego psa": a passing state needs a sentence that cares about it
      !(a.state && isLiving(noun) && !tpl.states),
  );
}

export function templatesFor(kase: Case, number: GramNumber, maxLevel?: Level): Template[] {
  return TEMPLATES.filter(
    (t) => t.case === kase && (t.number === "any" || t.number === number) && withinLevel(t, maxLevel),
  );
}

/** True when this noun can fill this frame in this number (the test behind `nounsFor`). */
export function nounFits(
  noun: Noun,
  tpl: Pick<Template, "requires" | "lemmas" | "excludeLemmas">,
  number: GramNumber,
  genders?: GenderGroup[],
  maxLevel?: Level,
): boolean {
  return (
    fitsTemplate(noun, tpl) &&
    withinLevel(noun, maxLevel) &&
    // "ciepłe wody", "mocne herbaty": mass nouns stay singular in a sentence
    (number === "sg" || (!noun.noPlural && !noun.onlySg && !noun.mass && noun.pl !== undefined)) &&
    (!genders || genders.length === 0 || genders.includes(genderGroup(noun.gender)))
  );
}

export function nounsFor(
  tpl: Template,
  number: GramNumber,
  genders?: GenderGroup[],
  maxLevel?: Level,
): Noun[] {
  return NOUNS.filter((noun) => nounFits(noun, tpl, number, genders, maxLevel));
}

/** English goes by sound: an hour, an old man; a young man, a university, a European city. */
export function article(phrase: string): string {
  const word = phrase.toLowerCase();
  if (/^(hour|honest|honou?r|heir)/.test(word)) return "an";
  if (/^(uni|use|usu|eu|one|once)/.test(word)) return "a";
  return "aeiou".includes(word[0] ?? "") ? "an" : "a";
}

/** "a" or "an" in front of the phrase; "a" + "other" is written as one word, "another". */
export function withArticle(phrase: string): string {
  if (/^other\b/i.test(phrase)) return `an${phrase}`;
  return `${article(phrase)} ${phrase}`;
}

export function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Adjective glosses that make a noun phrase definite in English, whatever the slot. */
const SINGLING = /^(best|worst|last|next|previous|same|only|whole)\b/;

export function renderEnglish(
  tpl: Template,
  noun: Noun,
  adj: Adjective | undefined,
  number: GramNumber,
): string {
  const head = number === "pl" ? noun.enPl : noun.en;
  const bare = adj ? `${adj.en} ${head}` : head;
  // a noun with its own article keeps it in the singular, whatever the slot:
  // "I like spring", "I'm interested in the economy"; an adjective makes a
  // season one of many again: "a cold spring", "the long winter"
  const fixed = number === "pl" || (noun.article === "none" && adj) ? undefined : noun.article;
  const own = fixed === "the" ? `the ${bare}` : bare;
  // a relative or friend with no possessive in Polish is "my ..." in English
  const mine = noun.tags.includes("family") || noun.tags.includes("friend");
  // fields and ideas take no article: "about history", "about work"
  const generic = noun.tags.includes("topic") || noun.tags.includes("abstract");
  const definite = fixed ? own : mine ? `my ${bare}` : generic ? bare : `the ${bare}`;
  // "last", "best", "previous" single one out: "the last train", "my best friend", never "a"
  const singling = !!adj && SINGLING.test(adj.en);
  const indefinite =
    fixed ? own
      : singling ? definite
        : number === "pl" || (noun.mass && !(noun.article === "none" && adj)) ? bare
          : withArticle(bare);
  const text = (tpl.enPl && number === "pl" ? tpl.enPl : tpl.en)
    .replace(/\{npDef\}/g, definite)
    .replace(/\{npBare\}/g, fixed ? own : bare)
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

/**
 * With a level cap, keeps only the cases that still have a sentence at that
 * level (an A1 learner meets no vocative yet), unless that would leave none.
 * Without one the list comes back as it is.
 */
export function casesWithin(cases: Case[], maxLevel: Level | undefined, open: (kase: Case) => boolean): Case[] {
  if (!maxLevel) return cases;
  const kept = cases.filter(open);
  return kept.length > 0 ? kept : cases;
}

const blankText = (tokens: Token[]) =>
  tokens
    .filter((t) => t.blank)
    .map((t) => t.text)
    .join(" ");

/**
 * True when the plural answer is spelled exactly like the singular one in a
 * sentence that does not show the number either: "Szukam piekarni" is one
 * bakery or several. Such a plural drills nothing the singular does not, and
 * its English ("bakeries") reads as a mistranslation of what the learner
 * sees, so the generator takes the singular reading instead.
 */
function looksSingular(tpl: Template, noun: Noun, adj: Adjective | undefined, kase: Case, mode: WordMode): boolean {
  if (tpl.number !== "any") return false;
  return blankText(buildTokens(noun, adj, "pl", kase, mode)) === blankText(buildTokens(noun, adj, "sg", kase, mode));
}

type Chosen = { tpl: Template; noun: Noun; adj?: Adjective };

function tryPick(
  kase: Case,
  number: GramNumber,
  mode: WordMode,
  rng: () => number,
  genders?: GenderGroup[],
  maxLevel?: Level,
): Chosen | null {
  const templates = templatesFor(kase, number, maxLevel);
  if (templates.length === 0) return null;
  for (const tpl of shuffle(templates, rng)) {
    // a level cap can leave a sentence with no noun to fill it: skip it
    const nouns = nounsFor(tpl, number, genders, maxLevel);
    if (nouns.length === 0) continue;
    for (const noun of shuffle(nouns, rng)) {
      if (mode === "nouns") return { tpl, noun };
      const adjectives = adjectivesFor(noun, tpl, maxLevel);
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
  maxLevel?: Level,
): Exercise | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    let number = pick(numbers, rng);
    const chosen = tryPick(kase, number, mode, rng, genders, maxLevel);
    if (!chosen) continue;
    const { tpl, noun, adj } = chosen;
    if (number === "pl" && numbers.includes("sg") && looksSingular(tpl, noun, adj, kase, mode)) number = "sg";
    const key = `${tpl.pl}|${noun.lemma}|${adj?.lemma ?? ""}|${number}`;
    if (taken.has(key) && attempt < 30) continue;
    taken.add(key);
    return assembleExercise(tpl, noun, adj, number, kase, mode, key);
  }
  return null;
}

/** The SRS card and skill of a case-drill question (plans/phase-2.md §1). */
export function caseCard(lemma: string, kase: Case, number: GramNumber): { card: string; skill: string } {
  return { card: `cases:${lemma}|${kase}|${number}`, skill: `cases:${kase}|${number}` };
}

/** Turns a chosen sentence, noun and adjective into the exercise the learner sees. */
function assembleExercise(
  tpl: Template,
  noun: Noun,
  adj: Adjective | undefined,
  number: GramNumber,
  kase: Case,
  mode: WordMode,
  key: string,
): Exercise {
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
    source: { noun, adj },
    ...caseCard(noun.lemma, kase, number),
  };
}

/**
 * One sentence built from exactly this template and noun, with no RNG: the
 * worked examples on the reference pages (lib/guides.ts). The noun is the
 * blank, as in a "nouns" session.
 */
export function exampleExercise(tpl: Template, noun: Noun, number: GramNumber): Exercise {
  const key = `${tpl.pl}|${noun.lemma}||${number}`;
  return assembleExercise(tpl, noun, undefined, number, tpl.case, "nouns", key);
}

/**
 * A sentence that can drill one noun in one cell. `needs` is set when only an
 * adjective shows the number: the plural noun is spelled like the singular in
 * a frame open to both ("Szukam piekarni"), which buildSession would read as a
 * singular, but "Szukam dobrych piekarni" is plainly plural.
 */
export type CardFrame = { tpl: Template; needs?: Adjective[] };

/**
 * The sentences that can drill one noun in one cell, with words up to `maxLevel`.
 *
 * A plural spelled like the singular is drilled where something shows the
 * number (a plural-only sentence, or an adjective that differs). Only when no
 * sentence can do that does it fall back to the frames that leave the number
 * unshown, as they are: a configured session with only the plural selected
 * asks the plural that way ("Szukam piekarni" read as plural), and the card it
 * stamps must still be one the scheduler can list and build.
 */
export function framesForCard(noun: Noun, kase: Case, number: GramNumber, maxLevel?: Level): CardFrame[] {
  const frames: CardFrame[] = [];
  const unshown: CardFrame[] = [];
  for (const tpl of templatesFor(kase, number, maxLevel)) {
    if (!nounFits(noun, tpl, number, undefined, maxLevel)) continue;
    if (number === "sg" || tpl.number === "pl" || !looksSingular(tpl, noun, undefined, kase, "nouns")) {
      frames.push({ tpl });
      continue;
    }
    const needs = adjectivesFor(noun, tpl, maxLevel).filter((a) => !looksSingular(tpl, noun, a, kase, "both"));
    if (needs.length > 0) frames.push({ tpl, needs });
    else unshown.push({ tpl });
  }
  return frames.length > 0 ? frames : unshown;
}

/**
 * One exercise drilling exactly this noun in this cell (an SRS card), with
 * sentences and adjectives up to `maxLevel`. In mode "both" it looks for a
 * sentence where an adjective fits and falls back to the noun alone; a frame
 * that `needs` an adjective always gets one. Null when no sentence can drill
 * the cell. It makes its own RNG draws: buildSession is untouched.
 */
export function buildCardExercise(
  noun: Noun,
  kase: Case,
  number: GramNumber,
  mode: "nouns" | "both",
  rng: () => number,
  maxLevel?: Level,
): Exercise | null {
  const frames = shuffle(framesForCard(noun, kase, number, maxLevel), rng);
  if (frames.length === 0) return null;
  let { tpl } = frames[0];
  let adj = frames[0].needs ? pick(frames[0].needs, rng) : undefined;
  if (mode === "both" && !adj) {
    for (const frame of frames) {
      const adjectives = frame.needs ?? adjectivesFor(noun, frame.tpl, maxLevel);
      if (adjectives.length === 0) continue;
      tpl = frame.tpl;
      adj = pick(adjectives, rng);
      break;
    }
  }
  const wordMode: WordMode = adj ? "both" : "nouns";
  const key = `${tpl.pl}|${noun.lemma}|${adj?.lemma ?? ""}|${number}`;
  return assembleExercise(tpl, noun, adj, number, kase, wordMode, key);
}

/** Builds a full session, spreading the selected cases evenly. */
export function buildSession(config: Config, seed = Date.now()): Exercise[] {
  const rng = makeRng(seed);
  const numbers = config.numbers.length ? config.numbers : (["sg"] as GramNumber[]);
  const cases = casesWithin(
    config.cases.length ? config.cases : (["nom"] as Case[]),
    config.maxLevel,
    (kase) => numbers.some((n) => templatesFor(kase, n, config.maxLevel).length > 0),
  );
  const taken = new Set<string>();
  const exercises: Exercise[] = [];

  let pool: Case[] = [];
  for (let i = 0; i < config.count; i++) {
    if (pool.length === 0) pool = shuffle(cases, rng);
    const kase = pool.pop()!;
    const exercise = buildExercise(
      kase,
      numbers,
      config.mode,
      rng,
      taken,
      config.genders,
      config.maxLevel,
    );
    if (!exercise) continue;
    if (config.answerMode === "choice") {
      const options = buildOptions(exercise, rng);
      if (options.length > 1) exercise.options = options;
    }
    exercises.push(exercise);
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
