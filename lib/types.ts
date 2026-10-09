export const CASES = ["nom", "gen", "dat", "acc", "ins", "loc", "voc"] as const;
export type Case = (typeof CASES)[number];

/** Cases drilled in the demonstrative-pronoun exercise — no vocative. */
export const PRONOUN_CASES = ["nom", "gen", "dat", "acc", "ins", "loc"] as const;

/** The possessive drill runs over the same cases. */
export const POSSESSIVE_CASES = PRONOUN_CASES;

/** Counted noun phrases are drilled over the same cases too. */
export const NUMBER_CASES = PRONOUN_CASES;

/** The individual drills, each with its own generator. */
export const DRILL_KINDS = ["cases", "pronouns", "possessives", "numbers", "verbs"] as const;
export type DrillKind = (typeof DRILL_KINDS)[number];

/** Which drill the configurator and runner are set up for; shuffle mixes the drills. */
export const EXERCISE_KINDS = [...DRILL_KINDS, "shuffle"] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];

/** Which demonstrative the pronoun exercise draws from. */
export type DemoChoice = "ten" | "tamten" | "both";

/** Possessives drilled, keyed without diacritics so they survive a URL. */
export const POSSESSIVES = [
  "moj",
  "twoj",
  "jego",
  "jej",
  "nasz",
  "wasz",
  "ich",
  "swoj",
] as const;
export type Possessive = (typeof POSSESSIVES)[number];

/** The four things the numbers exercise can ask for. */
export const NUMBER_DRILLS = ["count", "numeral", "spell", "ordinal"] as const;
export type NumberDrill = (typeof NUMBER_DRILLS)[number];

/** Tenses / moods the verbs exercise drills. */
export const TENSES = ["present", "past", "future", "futureCompound", "imperative"] as const;
export type Tense = (typeof TENSES)[number];

/** Which verbs the verbs exercise draws from: with or without "się". */
export const VERB_TYPES = ["plain", "reflexive", "both"] as const;
export type VerbType = (typeof VERB_TYPES)[number];

/** How high the spelling drill reaches. */
export const SPELL_RANGES = [20, 100, 1000, 9999] as const;
export type SpellRange = (typeof SPELL_RANGES)[number];

export type GramNumber = "sg" | "pl";

/** CEFR levels the lexicon is graded by, easiest first. */
export const LEVELS = ["A1", "A2", "B1", "B2"] as const;
export type Level = (typeof LEVELS)[number];

/** How common a word is, 1 (everyday) to 5 (rare). */
export const FREQS = [1, 2, 3, 4, 5] as const;
export type Freq = (typeof FREQS)[number];

/** True when an entry is at `max` or below; no cap lets everything through. */
export function withinLevel(entry: { level: Level }, max: Level | undefined): boolean {
  return !max || LEVELS.indexOf(entry.level) <= LEVELS.indexOf(max);
}

/** Polish genders, split by the distinctions that actually change endings. */
export const GENDERS = ["mPers", "mAnim", "mInanim", "f", "n"] as const;
export type Gender = (typeof GENDERS)[number];

/** The three buckets a learner picks from on the configurator. */
export const GENDER_GROUPS = ["m", "f", "n"] as const;
export type GenderGroup = (typeof GENDER_GROUPS)[number];

/** Collapses the ending-level genders into the pickable bucket. */
export function genderGroup(gender: Gender): GenderGroup {
  return gender === "f" ? "f" : gender === "n" ? "n" : "m";
}

export const TAGS = [
  "person",
  "profession",
  "animal",
  "food",
  "drink",
  "placeIn", // takes "w" + locative
  "placeTo", // sensible with "do" + genitive
  "surface", // takes "na" / "pod" / "nad" + case
  "vehicle",
  "object", // portable things you can buy, own or hold
  "text",
  "abstract",
  "family", // relatives: English glosses them as "my ..."
  "friend",
  "topic", // fields of interest: muzyka, historia, sport...
  "show", // things you watch: film, mecz, serial
  "time",
  "body",
  "plant",
  "water", // morze, jezioro, rzeka — "nad" rather than "do"
] as const;
export type Tag = (typeof TAGS)[number];

export type Forms = Record<Case, string>;

/**
 * Marks an entry a native speaker has not approved yet. Drafts are left out of
 * the published lexicon unless NEXT_PUBLIC_INCLUDE_DRAFTS=1 (see lib/lexicon.ts).
 */
export const REVIEW_STATES = ["draft"] as const;
export type Review = (typeof REVIEW_STATES)[number];

/** A noun's fixed English article; see Noun.article. */
export const NOUN_ARTICLES = ["none", "the"] as const;
export type NounArticle = (typeof NOUN_ARTICLES)[number];

export type Noun = {
  lemma: string;
  /** English singular, without article. */
  en: string;
  /** English plural. */
  enPl: string;
  /** CEFR level a learner meets the word at. */
  level: Level;
  /** 1 = most common; see data/README.md. */
  freq?: Freq;
  gender: Gender;
  tags: Tag[];
  /** Mass noun: never gets "a/an" in the English gloss, never counted unless `portions`. */
  mass?: boolean;
  /** A mass noun that is still counted in servings or loaves: dwie kawy, pięć chlebów. */
  portions?: boolean;
  /**
   * English article in the singular, whatever the sentence asks for: "none"
   * for seasons ("I like spring", never "a spring"), "the" for nouns that are
   * always definite in general statements ("the environment", "the economy").
   */
  article?: NounArticle;
  /** No possessive in front of it reads naturally: "mój Polak", "mój komar". */
  noPossessive?: boolean;
  /** Plural is not used in practice (mleko, muzyka...). */
  noPlural?: boolean;
  /** Has a plural, but not one a sentence about "my ..." can use (matki, żony). */
  onlySg?: boolean;
  sg: Forms;
  pl?: Forms;
  /** Extra accepted answers, e.g. { "pl.gen": ["pokojów"] }. */
  alt?: Record<string, string[]>;
  review?: Review;
};

export const ADJ_TYPES = ["hard", "soft", "velar"] as const;
export type AdjType = (typeof ADJ_TYPES)[number];

export type Adjective = {
  lemma: string;
  en: string;
  level: Level;
  freq?: Freq;
  /** Lemma minus its ending: dobry -> dobr, tani -> tan, drogi -> drog. */
  stem: string;
  type: AdjType;
  /** Masculine-personal nominative plural — the only irregular slot. */
  virilePl: string;
  /** A passing state or looks (chory, wysoki...): only in sentences that set `states`. */
  state?: boolean;
  /** Only used to address someone ("kochana babciu"), and only where a sentence asks for it. */
  address?: boolean;
  review?: Review;
};

export type Template = {
  case: Case;
  number: GramNumber | "any";
  /** CEFR level of the construction the sentence drills. */
  level: Level;
  /** Polish sentence containing the {NP} slot. */
  pl: string;
  /** English gloss containing {np} (indefinite) or {npDef} (definite). */
  en: string;
  /** Optional override used when the noun phrase is plural. */
  enPl?: string;
  /** Noun must carry at least one of these tags. */
  requires: Tag[];
  /** Nouns that fit even without a matching tag. */
  lemmas?: string[];
  /** Nouns that fit the tags but not this sentence (w ulicy, przed kuchnią...). */
  excludeLemmas?: string[];
  /** Allows state adjectives: "Opiekuję się chorą babcią", not "Kocham chorego psa". */
  states?: boolean;
  /** Only these adjectives make sense here ([] = no adjective at all). */
  adjOnly?: string[];
  /** One-line explanation of why this case is used here. */
  note: string;
  /** Set when the sentence has a first-person singular subject ("Widzę..."). */
  subject?: "1sg";
  review?: Review;
};

/** Shared by every sentence frame: which nouns it makes sense with. */
type NounFilter = {
  /** Noun must carry at least one of these tags. */
  requires: Tag[];
  /** Nouns that fit even without a matching tag. */
  lemmas?: string[];
  /** Nouns that fit the tags but not this sentence. */
  excludeLemmas?: string[];
};

/** A frame of the counting drill (data/count-frames.json): "Mam {N} {NP}." */
export type CountTemplate = NounFilter & {
  /** Polish frame with {N} for the numeral and {NP} for the counted noun; {V} is "jest" / "są". */
  pl: string;
  /** English with {np} for the counted phrase; {is} is "is" / "are". */
  en: string;
  /** The case the frame itself assigns — it only shows with "jeden". */
  case: "nom" | "acc";
  review?: Review;
};

/** The frame the numeral drill uses for one case (data/numeral-frames.json). */
export type NumeralTemplate = NounFilter & {
  /** Polish frame with {NP} for numeral + noun; {V} is "jest" / "są", {z} the preposition. */
  pl: string;
  en: string;
  review?: Review;
};

export type WordMode = "nouns" | "adjectives" | "both";

/** How the learner supplies the answer: type it out, or pick from options. */
export const ANSWER_MODES = ["typing", "choice"] as const;
export type AnswerMode = (typeof ANSWER_MODES)[number];

export type Config = {
  cases: Case[];
  numbers: GramNumber[];
  mode: WordMode;
  count: number;
  /** Which noun genders to draw from; omitted / empty means all. */
  genders?: GenderGroup[];
  /** Omitted means typing. */
  answerMode?: AnswerMode;
  /** Which drill this is; omitted means the case-declension drill. */
  kind?: ExerciseKind;
  /** Pronoun drill only: which demonstrative to use; omitted means both. */
  demo?: DemoChoice;
  /** Possessive drill only: which possessors to draw from; omitted means all. */
  owners?: Possessive[];
  /** Numbers drill only: which of the four sub-drills to mix; omitted means all. */
  drills?: NumberDrill[];
  /** Numbers drill only: the highest number the spelling drill reaches. */
  max?: SpellRange;
  /** Verbs drill only: which tenses to mix; omitted means all. */
  tenses?: Tense[];
  /** Verbs drill only: plain verbs, reflexive ones or both; omitted means both. */
  verbType?: VerbType;
  /** Shuffle only: which drills to mix; omitted means all. */
  mix?: DrillKind[];
  /** Highest CEFR level of words and sentences to draw; omitted means no cap. */
  maxLevel?: Level;
};

export type Token = { text: string; blank: boolean };

export type Exercise = {
  id: string;
  case: Case;
  number: GramNumber;
  /** Text before the noun phrase. */
  before: string;
  /** Text after the noun phrase. */
  after: string;
  tokens: Token[];
  /** Base form(s) shown as the hint, e.g. "czarny kot". */
  hint: string;
  en: string;
  /** Accepted answers for the blanked part. */
  answers: string[];
  note: string;
  /** Multiple-choice options, correct one included; absent in typing mode. */
  options?: string[];
  /** Replaces the case name on the progress line when no case is being drilled. */
  label?: string;
  /** Set on shuffle sessions so each answer is recorded against its own drill. */
  kind?: DrillKind;
  /** The words behind the blank, kept so a wrong answer can be explained. */
  source?: { noun: Noun; adj?: Adjective };
  /** The SRS card this question drills, e.g. "cases:kot|gen|pl" (see lib/cards.ts). */
  card?: string;
  /** The skill it counts toward in the weak-spots view, e.g. "cases:gen|pl". */
  skill?: string;
};

/** Why a wrong answer was wrong, as a category the weak-spots view can count (lib/diagnose.ts). */
export const MISS_KINDS = [
  "empty", // nothing typed
  "case", // a real form of the word, in another case
  "number", // right case, wrong number
  "caseNumber", // both wrong
  "accAnimacy", // masculine accusative: nominative vs genitive mix-up
  "gender", // adjective agreeing with the wrong gender
  "ending", // right stem, wrong ending
  "typo", // one letter away
  "wordCount", // too many or too few words in the blank
  "aspect", // verbs: the other aspect's form
  "person", // verbs: another person or number of the right verb
  "tense", // verbs: the right verb in another tense
  "pastGender", // verbs: past tense with the wrong gender ending (pisałam for pisałem)
  "government", // numbers: the counted noun in the wrong case or number (pięć koty)
  "numeralForm", // numbers: the numeral itself in the wrong gender or case (dwa for dwie)
  "other",
] as const;
export type MissKind = (typeof MISS_KINDS)[number];

export type CaseStat = { correct: number; total: number };
export type Stats = Partial<Record<Case, CaseStat>>;
