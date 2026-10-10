import { drillOfCard } from "./cards";
import type { CardInfo } from "./cards";
import { dueCards, introducedToday, levelCap, registrySources, weakSkills } from "./progress";
import type { Progress, Settings, Sources } from "./progress";
import { DRILL_KINDS, LEVELS } from "./types";
import type { DrillKind, Exercise, Level } from "./types";

/**
 * "Today's practice" (plans/phase-2.md §5–6): due reviews first, then new cards,
 * then filler. Pure: the same progress, time and seed give the same session.
 */
export type TodayPlan = {
  exercises: Exercise[];
  /** How many of them are reviews, new cards and filler. */
  due: number;
  fresh: number;
  extra: number;
  /** Nothing was due and the new-card budget is spent: this is extra practice. */
  extraOnly: boolean;
  /** The level cap new cards were drawn under. */
  level: Level;
  /** The session size asked for (the daily goal); `exercises` can be shorter when cards run out. */
  size: number;
  /** Cards due now in the chosen drills, including any that did not fit in the session. */
  dueTotal: number;
  /** What was left of the new-card budget before this session (newPerDay − introduced today). */
  newLeft: number;
};

export type TodayOptions = {
  settings: Settings;
  /** Restrict to these drills; all by default. */
  drills?: DrillKind[];
  answerMode?: "typing" | "choice";
  /** The card source per drill; the registry's (DRILLS[kind].cards) by default. Tests pass fakes. */
  sources?: Sources;
};

/** Reviews take at most this share of the session while new cards are available. */
export const DUE_SHARE = 0.7;
/** In filler and extra practice, cards from the weakest skills take at most this share. */
export const WEAK_SHARE = 0.5;

/** FNV-1a of a string, reduced to a builder seed. */
function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 1_000_000;
}

/** The default seed for a day: a hash of its local date, so a reload rebuilds the same session. */
export function daySeed(day: string): number {
  return hash(day);
}

/** The seed one card's exercise is built with: stable for a session seed, distinct across cards. */
export function cardSeed(seed: number, card: string): number {
  return hash(`${seed}|${card}`);
}

/** The part of a card id its skill doesn't name: the word ("kot"), or the owner / gender. */
function wordKey(info: CardInfo): string {
  const skill = new Set(info.skill.split(/[:|]/));
  return info.id
    .split(/[:|]/)
    .filter((part) => !skill.has(part))
    .join("|");
}

/** How far ahead a drill's list is searched for a card that doesn't repeat the last word or skill. */
const SPREAD_LOOKAHEAD = 64;

/**
 * New cards in introduction order (§5): by level, the drills taking turns within a level,
 * each drill's own cards in its `all()` order (freq, then file order). Within a drill the
 * next card skips ahead a little when it would repeat the word or skill just introduced,
 * so a first session doesn't decline one noun four times in a row. `lists` holds each
 * drill's unseen cards in `all()` order.
 */
export function orderNew(lists: CardInfo[][]): CardInfo[] {
  const out: CardInfo[] = [];
  for (const level of LEVELS) {
    const queues = lists.map((list) => list.filter((info) => info.level === level));
    const recent = lists.map(() => ({ word: "", skill: "" }));
    while (queues.some((q) => q.length > 0)) {
      queues.forEach((queue, d) => {
        if (queue.length === 0) return;
        const last = recent[d];
        let at = queue.findIndex(
          (info, i) => i < SPREAD_LOOKAHEAD && wordKey(info) !== last.word && info.skill !== last.skill,
        );
        if (at < 0) at = 0;
        const [info] = queue.splice(at, 1);
        recent[d] = { word: wordKey(info), skill: info.skill };
        out.push(info);
      });
    }
  }
  return out;
}

export function buildToday(progress: Progress, now: number, seed: number, opts: TodayOptions): TodayPlan {
  const sources = opts.sources ?? registrySources();
  const kinds = (opts.drills ?? [...DRILL_KINDS]).filter((kind) => sources[kind]);
  const drillOf = (id: string) => drillOfCard(id, kinds);
  const size = Math.max(0, Math.floor(opts.settings.goal));
  const level = levelCap(progress, sources);

  // every card the chosen drills know, for skills and the new-card list
  const infos = new Map<string, CardInfo>();
  const unseen: CardInfo[][] = [];
  for (const kind of kinds) {
    const list = sources[kind]!.all();
    for (const info of list) infos.set(info.id, info);
    unseen.push(
      list.filter(
        (info) => LEVELS.indexOf(info.level) <= LEVELS.indexOf(level) && !progress.cards[info.id],
      ),
    );
  }

  const due = dueCards(progress, now).filter((id) => drillOf(id));
  const newLeft = Math.max(0, opts.settings.newPerDay - introducedToday(progress, now));
  const freshAll = orderNew(unseen).map((info) => info.id);
  const fresh = newLeft > 0 ? freshAll : [];

  const picked: Picked[] = [];
  const used = new Set<string>();

  /** Builds cards from `pool` (from `cursor` on) until `n` were built; skips the unbuildable. */
  const draw = (pool: string[], cursor: { i: number }, n: number, bucket: number): number => {
    let built = 0;
    while (built < n && cursor.i < pool.length) {
      const card = pool[cursor.i++];
      if (used.has(card)) continue;
      used.add(card);
      const kind = drillOf(card);
      if (!kind) continue;
      const exercise = sources[kind]!.build(card, cardSeed(seed, card), opts.answerMode);
      if (!exercise) continue;
      picked.push({
        kind,
        bucket,
        exercise: {
          ...exercise,
          card: exercise.card ?? card,
          skill: exercise.skill ?? infos.get(card)?.skill,
        },
      });
      built++;
    }
    return built;
  };

  const dueAt = { i: 0 };
  const freshAt = { i: 0 };
  const dueCap = fresh.length > 0 ? Math.floor(size * DUE_SHARE) : size;
  let nDue = draw(due, dueAt, dueCap, 0);
  const nFresh = draw(fresh, freshAt, Math.min(newLeft, size - picked.length), 1);
  nDue += draw(due, dueAt, size - picked.length, 0);

  let nExtra = 0;
  if (picked.length < size) {
    const allowed = (id: string) => !!drillOf(id) && !used.has(id);
    const extra = fillerOrder(progress, now, allowed, infos, Math.ceil(size * WEAK_SHARE));
    nExtra = draw(extra, { i: 0 }, size - picked.length, 2);
  }
  // nothing else left to practise (a first day, or every seen card is far off): more new cards
  const extraOnly = nDue === 0 && nFresh === 0;
  const nOver = draw(freshAll, freshAt, size - picked.length, 1);

  return {
    exercises: interleave(picked),
    due: nDue,
    fresh: nFresh + nOver,
    extra: nExtra,
    extraOnly,
    level,
    size,
    dueTotal: due.length,
    newLeft,
  };
}

/**
 * Seen cards that are not due, for filler and extra practice: first the cards of the
 * weakest skills (lowest accuracy, ≥ 5 answers in 30 days), round robin over those
 * skills and at most `weakMax` of them, then every other card, due soonest first.
 */
function fillerOrder(
  progress: Progress,
  now: number,
  allowed: (id: string) => boolean,
  infos: Map<string, CardInfo>,
  weakMax: number,
): string[] {
  const soonest = Object.entries(progress.cards)
    .filter(([id, card]) => card.due > now && allowed(id))
    .sort(([a, x], [b, y]) => x.due - y.due || (a < b ? -1 : a > b ? 1 : 0))
    .map(([id]) => id);

  const bySkill = new Map<string, string[]>();
  for (const id of soonest) {
    const skill = infos.get(id)?.skill;
    if (!skill) continue;
    const ids = bySkill.get(skill) ?? [];
    ids.push(id);
    bySkill.set(skill, ids);
  }
  // a logged skill can be finer than its cards' (verbs: "verbs:past|3pl" is answered on
  // cards of "verbs:past"), so a weak skill takes the cards whose skill is it or a prefix of it
  const cardsOf = (skill: string): string[] => {
    for (let cut = skill.length; cut > 0; cut = skill.lastIndexOf("|", cut - 1)) {
      const ids = bySkill.get(skill.slice(0, cut));
      if (ids) return ids;
    }
    return [];
  };
  const weak = weakSkills(progress, now)
    .map((score) => cardsOf(score.skill))
    .filter((ids) => ids.length > 0);

  const first: string[] = [];
  const taken = new Set<string>();
  for (let i = 0; first.length < weakMax && weak.some((ids) => i < ids.length); i++) {
    for (const ids of weak) {
      if (i < ids.length && first.length < weakMax && !taken.has(ids[i])) {
        taken.add(ids[i]);
        first.push(ids[i]);
      }
    }
  }
  return [...first, ...soonest.filter((id) => !taken.has(id))];
}

type Picked = { exercise: Exercise; kind: DrillKind; bucket: number };

/**
 * Reorders so the same drill rarely comes twice in a row, bucket by bucket (reviews,
 * then new cards, then filler). Each slot takes the earliest remaining exercise of
 * another drill than the previous one, unless one drill has more than half of what is
 * left in the bucket: then that drill goes now, or repeats would become unavoidable.
 * Ids get the drill prefix, as in shuffle sessions.
 */
function interleave(picked: Picked[]): Exercise[] {
  const out: Exercise[] = [];
  const ids = new Set<string>();
  let prev: DrillKind | null = null;
  const buckets = [...new Set(picked.map((p) => p.bucket))].sort((a, b) => a - b);
  for (const bucket of buckets) {
    const rest = picked.filter((p) => p.bucket === bucket);
    while (rest.length) {
      const counts = new Map<DrillKind, number>();
      for (const p of rest) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
      let forced: DrillKind | null = null;
      for (const [kind, count] of counts) if (kind !== prev && 2 * count > rest.length) forced = kind;
      let at = rest.findIndex((p) => (forced ? p.kind === forced : p.kind !== prev));
      if (at < 0) at = 0;
      const [{ exercise, kind }] = rest.splice(at, 1);
      let id = `${kind}:${exercise.id}`;
      for (let n = 2; ids.has(id); n++) id = `${kind}:${exercise.id}~${n}`;
      ids.add(id);
      out.push({ ...exercise, id, kind });
      prev = kind;
    }
  }
  return out;
}
