import { agreementTemplatesFor, cellLevel } from "../agreement";
import type { CardInfo, CardSource } from "../cards";
import { CASE_INFO } from "../cases";
import { makeRng, pick } from "../generate";
import { DEMONSTRATIVES, buildPronounExercise, pronounCard } from "../pronouns";
import { GENDERS, PRONOUN_CASES, withinLevel } from "../types";
import type { Case, Gender, GramNumber } from "../types";
import { byIntroduction, isNumber, numberWord } from "./cases";

/**
 * SRS cards for the demonstrative drill: one paradigm cell,
 * `pronouns:<case>|<gender>|<sg|pl>`, counted toward `pronouns:<case>|<sg|pl>`.
 * The noun is only a carrier, and ten or tamten is drawn from the seed.
 *
 * A cell's level is the easiest frame × noun pair that drills it; `build` stays
 * at that level for both. Listed case by case, singular first, genders in
 * GENDERS order; every card has freq 3 (no word of its own).
 */

const NUMBERS: GramNumber[] = ["sg", "pl"];

const isPronounCase = (s: string): s is Case => (PRONOUN_CASES as readonly string[]).includes(s);
const isGender = (s: string): s is Gender => (GENDERS as readonly string[]).includes(s);

let cached: { list: CardInfo[]; byId: Map<string, CardInfo> } | null = null;

function cards() {
  if (cached) return cached;
  const list: CardInfo[] = [];
  for (const kase of PRONOUN_CASES) {
    for (const number of NUMBERS) {
      for (const gender of GENDERS) {
        const level = cellLevel(agreementTemplatesFor(kase, number), number, (n) => n.gender === gender);
        if (!level) continue;
        const { card: id, skill } = pronounCard(kase, gender, number);
        list.push({ id, skill, level, freq: 3 });
      }
    }
  }
  const sorted = byIntroduction(list);
  cached = { list: sorted, byId: new Map(sorted.map((c) => [c.id, c])) };
  return cached;
}

export const pronounsCards: CardSource = {
  all: (maxLevel) => cards().list.filter((c) => withinLevel(c, maxLevel)),

  build(card, seed, answerMode = "typing") {
    const info = cards().byId.get(card);
    if (!info) return null;
    const [kase, gender, number] = card.slice("pronouns:".length).split("|");
    if (!isPronounCase(kase) || !isGender(gender) || !isNumber(number)) return null;
    const rng = makeRng(seed);
    const base = pick([...DEMONSTRATIVES], rng);
    return buildPronounExercise(base, kase, [number], answerMode, rng, new Set(), undefined, info.level, gender);
  },

  skillLabel(skill) {
    const [kase, number] = skill.slice("pronouns:".length).split("|");
    if (!skill.startsWith("pronouns:") || !isPronounCase(kase) || !isNumber(number)) return skill;
    return `ten / tamten — ${CASE_INFO[kase].en.toLowerCase()} ${numberWord(number)}`;
  },
};
