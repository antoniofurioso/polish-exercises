import type { AnswerMode, DrillKind, Exercise, Freq, Level } from "./types";

/**
 * SRS cards: the unit the scheduler tracks. A card is skill × word, e.g.
 * "cases:kot|gen|pl" (the noun kot in the genitive plural). Ids are built only
 * from lemmas and enum values so they survive syncing between devices. The id
 * scheme of each drill is documented in plans/phase-2.md and its lib/cards/ file.
 */
export type CardInfo = {
  id: string;
  /** The weak-spots group the card counts toward, e.g. "cases:gen|pl". */
  skill: string;
  /** When a learner should meet it: the higher of its word's and its easiest frame's level. */
  level: Level;
  /** The word's frequency, 3 when the card has no word of its own. */
  freq: Freq;
};

/** What a drill exposes to the scheduler; reached as DRILLS[kind].cards. */
export type CardSource = {
  /** Every published card at maxLevel or below, in introduction order (level, freq, file order). */
  all(maxLevel?: Level): CardInfo[];
  /**
   * One exercise drilling exactly this card, deterministic in `seed`, with `card`
   * and `skill` set; null when the card can no longer be built (word removed or a draft).
   */
  build(card: string, seed: number, answerMode?: AnswerMode): Exercise | null;
  /** A learner-facing name for a skill: "Instrumental plural". */
  skillLabel(skill: string): string;
};

/** The drill a card or skill id belongs to, or null for an id from no known drill. */
export function drillOfCard(id: string, kinds: readonly DrillKind[]): DrillKind | null {
  const prefix = id.slice(0, id.indexOf(":"));
  return (kinds as readonly string[]).includes(prefix) ? (prefix as DrillKind) : null;
}
