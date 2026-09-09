export const CASES = ["nom", "gen", "dat", "acc", "ins", "loc", "voc"] as const;
export type Case = (typeof CASES)[number];

export type GramNumber = "sg" | "pl";

/** Polish genders, split by the distinctions that actually change endings. */
export type Gender = "mPers" | "mAnim" | "mInanim" | "f" | "n";

/** The three buckets a learner picks from on the configurator. */
export const GENDER_GROUPS = ["m", "f", "n"] as const;
export type GenderGroup = (typeof GENDER_GROUPS)[number];

/** Collapses the ending-level genders into the pickable bucket. */
export function genderGroup(gender: Gender): GenderGroup {
  return gender === "f" ? "f" : gender === "n" ? "n" : "m";
}

export type Tag =
  | "person"
  | "profession"
  | "animal"
  | "food"
  | "drink"
  | "placeIn" // takes "w" + locative
  | "placeTo" // sensible with "do" + genitive
  | "surface" // takes "na" / "pod" / "nad" + case
  | "vehicle"
  | "object"
  | "text"
  | "abstract";

export type Forms = Record<Case, string>;

export type Noun = {
  lemma: string;
  /** English singular, without article. */
  en: string;
  /** English plural. */
  enPl: string;
  gender: Gender;
  tags: Tag[];
  /** Mass noun: never gets "a/an" in the English gloss. */
  mass?: boolean;
  /** Plural is not used in practice (mleko, muzyka...). */
  noPlural?: boolean;
  sg: Forms;
  pl?: Forms;
  /** Extra accepted answers, e.g. { "pl.gen": ["pokojów"] }. */
  alt?: Record<string, string[]>;
};

export type AdjType = "hard" | "soft" | "velar";

export type Adjective = {
  lemma: string;
  en: string;
  /** Lemma minus its ending: dobry -> dobr, tani -> tan, drogi -> drog. */
  stem: string;
  type: AdjType;
  /** Masculine-personal nominative plural — the only irregular slot. */
  virilePl: string;
  /** Only combine with nouns carrying one of these tags (omit = any). */
  fits?: Tag[];
};

export type Template = {
  case: Case;
  number: GramNumber | "any";
  /** Polish sentence containing the {NP} slot. */
  pl: string;
  /** English gloss containing {np} (indefinite) or {npDef} (definite). */
  en: string;
  /** Optional override used when the noun phrase is plural. */
  enPl?: string;
  /** Noun must carry at least one of these tags. */
  requires: Tag[];
  /** Nouns that fit the tags but not this sentence (w ulicy, przed kuchnią...). */
  excludeLemmas?: string[];
  /** One-line explanation of why this case is used here. */
  note: string;
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
  /** The words behind the blank, kept so a wrong answer can be explained. */
  source?: { noun: Noun; adj?: Adjective };
};

export type CaseStat = { correct: number; total: number };
export type Stats = Partial<Record<Case, CaseStat>>;
