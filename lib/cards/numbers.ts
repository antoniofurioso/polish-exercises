import type { CardInfo, CardSource } from "../cards";
import { buildNumberCard, numberCardCatalog } from "../numbers";
import { LEVELS, withinLevel } from "../types";
import type { Level } from "../types";

/**
 * SRS cards for the numbers drill. A card is a grammar rule × a range of
 * numbers, never one sentence: the number, noun and frame are drawn from the
 * seed each time it is built. Ids (built in lib/numbers.ts, `cardOf`):
 *
 *   numbers:count|<band>|<case>       the counted noun after a numeral
 *     band  1             jeden kot / jednego psa
 *           2-4           dwa koty (not with men)
 *           5+            5-10 and round numbers: pięć kotów, dwadzieścia kotów, sto kotów
 *           teens         11-19 and 111-119, the 12-14 trap: dwanaście kotów
 *           compound2-4   compounds ending in 2-4: dwadzieścia dwa koty, sto dwa koty
 *           compound      other compounds: dwadzieścia jeden kotów, dwadzieścia pięć kotów
 *           men           masculine-personal nouns, any n ≥ 2: pięciu studentów, dwóch lekarzy
 *     case  nom | acc     the case the frame assigns ("Tu są…" / "Mam…")
 *
 *   numbers:numeral|<class>|<case>    the numeral itself, declined
 *     class 1 (jeden) | 2-4 | 5+ (5-20 and the tens) | 100 (sto) |
 *           men (the -u / -ch form counting men: nom and acc only)
 *     case  nom | acc | gen | loc | ins | dat
 *
 *   numbers:spell|<magnitude>         a figure written out in words
 *     units 0-10 · teens 11-19 · tens 20-99 · hundreds 100-999 ·
 *     thousand 1000-1999 (tysiąc) · thousands2-4 2000-4999 (tysiące) ·
 *     thousands5+ 5000-9999 (tysięcy)
 *
 *   numbers:ordinal|date|gen          piątego maja
 *   numbers:ordinal|time|<nom|loc>    jest piąta / o piątej
 *   numbers:ordinal|plain|<case>      an ordinal agreeing with a noun (singular)
 *
 * Skill = the drill plus the first facet: `numbers:count|5+`,
 * `numbers:numeral|2-4`, `numbers:spell|hundreds`, `numbers:ordinal|date`.
 *
 * Level = the higher of the rule's level and the easiest published word (and,
 * for plain ordinals, agreement frame) that can carry the card. Rule levels:
 *   count    1, 2-4, 5+ A1 · teens, compound2-4, compound A2 · men B1
 *   numeral  nom / acc A1 (100: A2) · men and every oblique case B1
 *   spell    units, teens, tens A1 · hundreds and thousands A2
 *   ordinal  plain A1 (the frame's level raises gen / loc / dat / ins) ·
 *            time nom A1 · time loc A2 · date A2
 * Freq is 3 for every card (none has a word of its own). `all()` sorts by
 * level, then teaching order: spell, count, numeral, ordinal; within each the
 * bands above in order (1 before 2-4 before 5+, units before thousands) and
 * cases nom, acc, gen, loc, ins, dat. `build` draws its words and frames at or
 * below the card's level.
 */

const COUNT_LABELS: Record<string, string> = {
  "1": "Counting with 1 (jeden kot)",
  "2-4": "Counting with 2–4 (dwa koty)",
  "5+": "Counting with 5 and up (pięć kotów)",
  teens: "Counting with 11–19 (dwanaście kotów)",
  "compound2-4": "Counting with 22–24, 32… (dwadzieścia dwa koty)",
  compound: "Counting with 21, 25, 31… (dwadzieścia pięć kotów)",
  men: "Counting men (pięciu studentów)",
};

const NUMERAL_LABELS: Record<string, string> = {
  "1": "Declining jeden (jednego, jednym)",
  "2-4": "Declining 2–4 (dwóch, dwoma)",
  "5+": "Declining 5 and up (pięciu, pięcioma)",
  "100": "Declining sto (stu)",
  men: "Numerals with men (dwóch, pięciu)",
};

const SPELL_LABELS: Record<string, string> = {
  units: "Writing out 0–10",
  teens: "Writing out 11–19",
  tens: "Writing out tens (20–99)",
  hundreds: "Writing out hundreds",
  thousand: "Writing out 1000–1999 (tysiąc)",
  "thousands2-4": "Writing out 2000–4999 (tysiące)",
  "thousands5+": "Writing out 5000 and up (tysięcy)",
};

const ORDINAL_LABELS: Record<string, string> = {
  date: "Dates (ordinals)",
  time: "Telling the time (ordinals)",
  plain: "Ordinals (pierwszy, drugi…)",
};

const LABELS: Record<string, Record<string, string>> = {
  count: COUNT_LABELS,
  numeral: NUMERAL_LABELS,
  spell: SPELL_LABELS,
  ordinal: ORDINAL_LABELS,
};

/** A card's level-sorted place: level first, the catalog's teaching order after (sort is stable). */
const byLevel = (a: CardInfo, b: CardInfo) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level);

export const numbersCards: CardSource = {
  all(maxLevel?: Level): CardInfo[] {
    return numberCardCatalog()
      .filter((c) => withinLevel(c, maxLevel))
      .map((c): CardInfo => ({ id: c.id, skill: c.skill, level: c.level, freq: 3 }))
      .sort(byLevel);
  },

  build: (card, seed, answerMode) => buildNumberCard(card, seed, answerMode ?? "typing"),

  skillLabel(skill: string): string {
    const [drill, facet] = skill.replace(/^numbers:/, "").split("|");
    return LABELS[drill]?.[facet] ?? skill;
  },
};
