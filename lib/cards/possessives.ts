import { cellLevel } from "../agreement";
import type { CardInfo, CardSource } from "../cards";
import { CASE_INFO } from "../cases";
import { makeRng } from "../generate";
import { buildPossessiveExercise, possessiveCard, templatesForOwner } from "../possessives";
import { GENDERS, POSSESSIVE_CASES, POSSESSIVES, withinLevel } from "../types";
import type { Case, Gender, GramNumber, Possessive } from "../types";
import { byIntroduction, isNumber, numberWord } from "./cases";

/**
 * SRS cards for the possessive drill: one owner in one paradigm cell,
 * `possessives:<owner>|<case>|<gender>|<sg|pl>`, counted toward
 * `possessives:<case>|<sg|pl>`. The noun is only a carrier.
 *
 * A cell's level is the easiest frame × noun pair that drills it (swój only in
 * frames with a subject, never a noPossessive noun); `build` stays at that
 * level. Listed case by case, singular first, then owner in POSSESSIVES order,
 * then gender; every card has freq 3.
 */

const NUMBERS: GramNumber[] = ["sg", "pl"];

const isPossessiveCase = (s: string): s is Case => (POSSESSIVE_CASES as readonly string[]).includes(s);
const isGender = (s: string): s is Gender => (GENDERS as readonly string[]).includes(s);
const isOwner = (s: string): s is Possessive => (POSSESSIVES as readonly string[]).includes(s);

let cached: { list: CardInfo[]; byId: Map<string, CardInfo> } | null = null;

function cards() {
  if (cached) return cached;
  const list: CardInfo[] = [];
  for (const kase of POSSESSIVE_CASES) {
    for (const number of NUMBERS) {
      for (const owner of POSSESSIVES) {
        for (const gender of GENDERS) {
          const level = cellLevel(
            templatesForOwner(owner, kase, number),
            number,
            (n) => n.gender === gender && !n.noPossessive,
          );
          if (!level) continue;
          const { card: id, skill } = possessiveCard(owner, kase, gender, number);
          list.push({ id, skill, level, freq: 3 });
        }
      }
    }
  }
  const sorted = byIntroduction(list);
  cached = { list: sorted, byId: new Map(sorted.map((c) => [c.id, c])) };
  return cached;
}

export const possessivesCards: CardSource = {
  all: (maxLevel) => cards().list.filter((c) => withinLevel(c, maxLevel)),

  build(card, seed, answerMode = "typing") {
    const info = cards().byId.get(card);
    if (!info) return null;
    const [owner, kase, gender, number] = card.slice("possessives:".length).split("|");
    if (!isOwner(owner) || !isPossessiveCase(kase) || !isGender(gender) || !isNumber(number)) return null;
    const rng = makeRng(seed);
    return buildPossessiveExercise(owner, kase, [number], answerMode, rng, new Set(), undefined, info.level, gender);
  },

  skillLabel(skill) {
    const [kase, number] = skill.slice("possessives:".length).split("|");
    if (!skill.startsWith("possessives:") || !isPossessiveCase(kase) || !isNumber(number)) return skill;
    return `Possessives — ${CASE_INFO[kase].en.toLowerCase()} ${numberWord(number)}`;
  },
};
