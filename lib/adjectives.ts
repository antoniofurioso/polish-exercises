import { LEXICON } from "./lexicon";
import type { Adjective } from "./types";

/**
 * stem = lemma minus its ending (dobry -> dobr, tani -> tan, drogi -> drog).
 * virilePl = masculine-personal nominative plural, the one slot rules cannot
 * derive reliably because of consonant alternations (dobry -> dobrzy).
 * state = a passing condition or looks (chory, wysoki): odd on a person in most sentences.
 * address = only when speaking to someone (kochany).
 */
export const ADJECTIVES: Adjective[] = LEXICON.adjectives;

/**
 * Which adjectives a Polish speaker would actually put in front of each noun,
 * keyed by noun lemma. A noun missing here, or with an empty list, never gets
 * an adjective — better no sentence than "niebieska zupa" or "wysoka kawa".
 */
export const COLLOCATIONS: Record<string, string[]> = LEXICON.collocations;
