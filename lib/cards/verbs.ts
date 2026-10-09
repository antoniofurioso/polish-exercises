import type { CardInfo, CardSource } from "../cards";
import { LEVELS, TENSES } from "../types";
import type { Level, Tense } from "../types";
import { VERBS, buildVerbCard, canDrill, parseVerbCard, parseVerbSkill, verbCardId } from "../verbs";

/**
 * SRS cards for the verbs drill: one card per verb × tense, "verbs:pisać|past"
 * (the imperfective infinitive as stored, "się" included). Skills are tense ×
 * person, "verbs:past|3pl", with the person as 1sg 2sg 3sg 1pl 2pl 3pl (the
 * imperative has only 2sg, 1pl and 2pl). The person is drawn per exercise, so
 * a card's own `skill` in all() is the tense group, "verbs:past", a prefix of
 * every skill its exercises carry. Ids are built in lib/verbs.ts
 * (verbCardId, verbSkillId), which also stamps them on every verbs exercise.
 *
 * A card exists only for a tense the drill can actually build the verb in: no
 * simple future without a perfective, no compound future for a motion or
 * stative verb, no imperative without an `imp` (see CAN_BUILD in lib/verbs.ts).
 */

/**
 * The level a tense is introduced at; a card's level is the higher of this and
 * its verb's. The present is the first thing an A1 learner conjugates; the
 * past, both futures and the imperative (all of which need aspect) come at A2.
 */
export const TENSE_LEVEL: Record<Tense, Level> = {
  present: "A1",
  past: "A2",
  future: "A2",
  futureCompound: "A2",
  imperative: "A2",
};

const TENSE_EN: Record<Tense, string> = {
  present: "Present tense",
  past: "Past tense",
  future: "Simple future (perfective)",
  futureCompound: "Compound future (będę + verb)",
  imperative: "Imperative",
};

const ORDINAL = ["", "1st", "2nd", "3rd"];

const maxLevel = (a: Level, b: Level): Level => (LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b);
const rank = (level: Level) => LEVELS.indexOf(level);

function all(cap?: Level): CardInfo[] {
  const cards: (CardInfo & { tense: number; index: number })[] = [];
  VERBS.forEach((verb, index) => {
    TENSES.forEach((tense, t) => {
      if (!canDrill(verb, tense)) return;
      const level = maxLevel(verb.level, TENSE_LEVEL[tense]);
      if (cap && rank(level) > rank(cap)) return;
      cards.push({
        id: verbCardId(verb, tense),
        // the person is drawn per exercise, so the card belongs to the whole tense:
        // every skill its exercises carry ("verbs:past|3pl") starts with "verbs:past|"
        skill: `verbs:${tense}`,
        level,
        freq: verb.freq ?? 3,
        tense: t,
        index,
      });
    });
  });
  cards.sort(
    (a, b) => rank(a.level) - rank(b.level) || a.freq - b.freq || a.tense - b.tense || a.index - b.index,
  );
  return cards.map(({ id, skill, level, freq }) => ({ id, skill, level, freq }));
}

export const verbsCards: CardSource = {
  all,
  build(card, seed, answerMode) {
    const parsed = parseVerbCard(card);
    return parsed ? buildVerbCard(parsed.inf, parsed.tense, seed, answerMode) : null;
  },
  skillLabel(skill) {
    const tense = skill.replace(/^verbs:/, "");
    if (tense !== skill && (TENSES as readonly string[]).includes(tense)) return TENSE_EN[tense as Tense];
    const cell = parseVerbSkill(skill);
    if (!cell) return skill;
    const number = cell.number === "sg" ? "singular" : "plural";
    return `${TENSE_EN[cell.tense]} — ${ORDINAL[cell.person]} person ${number}`;
  },
};
