import type { CardInfo, CardSource } from "../cards";
import { CASE_INFO } from "../cases";
import { buildOptions } from "../choices";
import { buildCardExercise, caseCard, framesForCard, makeRng } from "../generate";
import type { CardFrame } from "../generate";
import { NOUNS } from "../nouns";
import { CASES, LEVELS, withinLevel } from "../types";
import type { Case, GramNumber, Level } from "../types";

/**
 * SRS cards for the cases drill: one noun in one cell, `cases:<lemma>|<case>|<sg|pl>`,
 * counted toward the skill `cases:<case>|<sg|pl>`.
 *
 * A card exists for every case and number a published sentence can drill the
 * noun in (no plural for noPlural / onlySg / mass nouns, and a plural spelled
 * like the singular where an adjective shows the number, or, when nothing can
 * show it, in the sentences a plural-only configured session asks it in: see
 * framesForCard). So every card a configured session stamps is listed here and
 * builds. Its level is
 * the higher of the noun's and the easiest such sentence's, and `build` stays
 * at that level: an A1 card is drilled with A1 sentences, on the noun alone;
 * from A2 up an adjective that collocates with the noun rides along ("both"
 * mode) wherever a sentence takes one.
 */

const NUMBERS: GramNumber[] = ["sg", "pl"];

export const isCase = (s: string): s is Case => (CASES as readonly string[]).includes(s);
export const isNumber = (s: string): s is GramNumber => s === "sg" || s === "pl";
export const numberWord = (n: GramNumber) => (n === "pl" ? "plural" : "singular");

/** Stable sort into introduction order: level, then freq; ties keep the order they were listed in. */
export function byIntroduction(cards: CardInfo[]): CardInfo[] {
  return cards
    .map((card, i) => ({ card, i }))
    .sort(
      (a, b) =>
        LEVELS.indexOf(a.card.level) - LEVELS.indexOf(b.card.level) ||
        a.card.freq - b.card.freq ||
        a.i - b.i,
    )
    .map(({ card }) => card);
}

/** Every card with no level cap, in introduction order, keyed by id too. Built once. */
let cached: { list: CardInfo[]; byId: Map<string, CardInfo> } | null = null;

function cards() {
  if (cached) return cached;
  const list: CardInfo[] = [];
  for (const noun of NOUNS) {
    for (const kase of CASES) {
      for (const number of NUMBERS) {
        const frames = framesForCard(noun, kase, number);
        if (frames.length === 0) continue;
        // a frame that needs an adjective opens with its easiest one
        const frameLevel = ({ tpl, needs }: CardFrame) =>
          Math.max(LEVELS.indexOf(tpl.level), ...(needs ? [Math.min(...needs.map((a) => LEVELS.indexOf(a.level)))] : []));
        const easiest = Math.min(...frames.map(frameLevel));
        const level: Level = LEVELS[Math.max(easiest, LEVELS.indexOf(noun.level))];
        const { card: id, skill } = caseCard(noun.lemma, kase, number);
        list.push({ id, skill, level, freq: noun.freq ?? 3 });
      }
    }
  }
  const sorted = byIntroduction(list);
  cached = { list: sorted, byId: new Map(sorted.map((c) => [c.id, c])) };
  return cached;
}

export const casesCards: CardSource = {
  all: (maxLevel) => cards().list.filter((c) => withinLevel(c, maxLevel)),

  build(card, seed, answerMode) {
    const info = cards().byId.get(card);
    if (!info) return null;
    const [lemma, kase, number] = card.slice("cases:".length).split("|");
    const noun = NOUNS.find((n) => n.lemma === lemma);
    if (!noun || !isCase(kase) || !isNumber(number)) return null;
    const rng = makeRng(seed);
    const mode = info.level === "A1" ? "nouns" : "both";
    const exercise = buildCardExercise(noun, kase, number, mode, rng, info.level);
    if (!exercise) return null;
    if (answerMode === "choice") {
      const options = buildOptions(exercise, rng);
      if (options.length > 1) exercise.options = options;
    }
    return exercise;
  },

  skillLabel(skill) {
    const [kase, number] = skill.slice("cases:".length).split("|");
    if (!skill.startsWith("cases:") || !isCase(kase) || !isNumber(number)) return skill;
    return `${CASE_INFO[kase].en} ${numberWord(number)}`;
  },
};
