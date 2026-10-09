import nounData from "../data/nouns.json";
import { loadNouns } from "./load";
import type { Case, GramNumber, Noun, Tag } from "./types";

/**
 * Every accepted spelling of one cell of a noun's table, primary form first.
 * Empty when that number has no table at all (mleko, muzyka...).
 */
export function nounVariants(noun: Noun, number: GramNumber, kase: Case): string[] {
  const table = number === "pl" ? noun.pl : noun.sg;
  if (!table) return [];
  return [table[kase], ...(noun.alt?.[`${number}.${kase}`] ?? [])];
}

/** The noun lexicon, in data/nouns.json; see data/README.md for the layout. */
export const NOUNS: Noun[] = loadNouns(nounData);

export function nounsWithTag(tags: Tag[]): Noun[] {
  return NOUNS.filter((noun) => noun.tags.some((t) => tags.includes(t)));
}
