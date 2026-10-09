import { describe, expect, it } from "vitest";
import type { CardSource } from "../cards";
import { makeRng } from "../generate";
import type { Verdict } from "../grade";
import {
  apply,
  cardsDue,
  compact,
  dueCards,
  EMPTY_PROGRESS,
  introducedToday,
  levelCap,
  migrateV1,
  replay,
  streak,
  todayCount,
  weakSpots,
} from "../progress";
import type { AnswerEvent, DayCount, Progress } from "../progress";
import { addDays, dayKey, startOfDay } from "../srs";
import type { Case, DrillKind, Level, MissKind } from "../types";

const NOW = new Date(2026, 9, 9, 18, 0).getTime();
const TODAY = dayKey(NOW);
const HOUR = 3_600_000;

function event(t: number, card: string, verdict: Verdict, extra: Partial<AnswerEvent> = {}): AnswerEvent {
  const drill = card.slice(0, card.indexOf(":")) as DrillKind;
  return {
    t,
    day: dayKey(t),
    card,
    skill: `${drill}:${card.split("|")[1] ?? "x"}`,
    verdict,
    drill,
    case: "gen",
    ...extra,
  };
}

/** A random but reproducible answer log over a few weeks. */
function randomLog(n: number, seed: number): AnswerEvent[] {
  const rng = makeRng(seed);
  const drills: DrillKind[] = ["cases", "pronouns", "verbs"];
  const cases: Case[] = ["nom", "gen", "acc", "ins"];
  const misses: MissKind[] = ["case", "ending", "typo", "gender"];
  const verdicts: Verdict[] = ["correct", "correct", "diacritics", "wrong"];
  const events: AnswerEvent[] = [];
  let t = NOW - 40 * 24 * HOUR;
  for (let i = 0; i < n; i++) {
    t += Math.floor(rng() * 3 * HOUR);
    const drill = drills[Math.floor(rng() * drills.length)];
    const word = `w${Math.floor(rng() * 12)}`;
    const kase = cases[Math.floor(rng() * cases.length)];
    const verdict = verdicts[Math.floor(rng() * verdicts.length)];
    events.push({
      t,
      day: dayKey(t),
      card: `${drill}:${word}|${kase}|sg`,
      skill: `${drill}:${kase}|sg`,
      verdict,
      drill,
      case: kase,
      ...(verdict === "wrong" ? { miss: misses[Math.floor(rng() * misses.length)] } : {}),
    });
  }
  return events;
}

const withoutBase = ({ base: _base, ...rest }: Progress) => {
  void _base;
  return rest;
};

describe("apply and replay", () => {
  const log = randomLog(600, 1);

  it("replay reproduces the incrementally folded cache exactly", () => {
    const incremental = log.reduce(apply, EMPTY_PROGRESS);
    const replayed = replay(log);
    expect(replayed).toEqual(incremental);
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(incremental));
  });

  it("is pure", () => {
    const before = replay(log.slice(0, 100));
    const snapshot = JSON.parse(JSON.stringify(before));
    apply(before, log[100]);
    replay(log.slice(100), before);
    expect(before).toEqual(snapshot);
    expect(EMPTY_PROGRESS).toEqual({ v: 2, cards: {}, skills: {}, days: {}, cases: {} });
  });

  it("counts cards, skills, days, cases and misses", () => {
    const t = NOW - HOUR;
    const p = [
      event(t, "cases:kot|gen|pl", "correct", { skill: "cases:gen|pl" }),
      event(t + 1, "cases:kot|gen|pl", "wrong", { skill: "cases:gen|pl", miss: "ending" }),
      event(t + 2, "cases:pies|gen|pl", "diacritics", { skill: "cases:gen|pl" }),
    ].reduce(apply, EMPTY_PROGRESS);
    expect(p.cards["cases:kot|gen|pl"]).toMatchObject({ seen: 2, right: 1, lapses: 1 });
    expect(p.skills["cases:gen|pl"]).toEqual({
      correct: 2,
      total: 3,
      misses: { ending: 1 },
      days: { [TODAY]: { answered: 3, correct: 2 } },
    });
    expect(p.days[TODAY]).toEqual({ answered: 3, correct: 2 });
    // the configurator percentages only count fully correct answers, as in v1
    expect(p.cases.cases).toEqual({ gen: { correct: 1, total: 3 } });
  });
});

describe("compact", () => {
  const log = randomLog(500, 2);
  const full = replay(log);

  it("folds the oldest events into base; replay(base, kept) equals the full replay", () => {
    const { progress, events } = compact(full, log, 120);
    expect(events).toEqual(log.slice(-120));
    expect(withoutBase(progress)).toEqual(full);
    expect(replay(events, progress.base)).toEqual(progress);
    expect(withoutBase(replay(events, progress.base))).toEqual(full);
  });

  it("can compact again, and survives a JSON round trip", () => {
    const once = compact(full, log, 300);
    const twice = compact(once.progress, once.events, 50);
    const stored = JSON.parse(JSON.stringify(twice)) as typeof twice;
    expect(withoutBase(replay(stored.events, stored.progress.base))).toEqual(full);
    // later answers keep folding on top
    const more = randomLog(20, 3).map((e) => ({ ...e, t: e.t + 50 * 24 * HOUR, day: dayKey(e.t + 50 * 24 * HOUR) }));
    expect(withoutBase(more.reduce(apply, twice.progress))).toEqual(replay([...log, ...more]));
    expect(withoutBase(replay([...stored.events, ...more], stored.progress.base))).toEqual(
      replay([...log, ...more]),
    );
  });

  it("leaves a short log alone", () => {
    const short = compact(full, log, 1000);
    expect(short.progress).toBe(full);
    expect(short.events).toBe(log);
  });
});

describe("migrateV1", () => {
  const v1 = { cases: { gen: { correct: 3, total: 4 } }, verbs: { nom: { correct: 1, total: 2 } } };

  it("adds the v1 counts once", () => {
    const log = [event(NOW, "cases:kot|gen|sg", "correct")];
    const migrated = migrateV1(replay(log), v1);
    expect(migrated.migrated).toBe(true);
    expect(migrated.cases.cases?.gen).toEqual({ correct: 4, total: 5 });
    expect(migrated.cases.verbs?.nom).toEqual({ correct: 1, total: 2 });
    expect(migrateV1(migrated, v1)).toBe(migrated);
  });

  it("keeps them through a replay and a compaction", () => {
    const log = randomLog(50, 4);
    const migrated = migrateV1(replay(log), v1);
    expect(withoutBase(replay(log, migrated.base))).toEqual(withoutBase(migrated));
    const c = compact(migrated, log, 10);
    expect(withoutBase(replay(c.events, c.progress.base))).toEqual(withoutBase(migrated));
    expect(replay(c.events, c.progress.base).migrated).toBe(true);
  });
});

describe("today's counts and due cards", () => {
  it("counts today's answers, due cards and cards introduced today", () => {
    const yesterday = startOfDay(NOW, -1) + 10 * HOUR;
    const p = [
      event(yesterday, "cases:a|gen|sg", "correct"),
      event(yesterday, "cases:b|gen|sg", "wrong"),
      event(NOW - HOUR, "cases:c|gen|sg", "correct"),
      event(NOW - HOUR, "cases:a|gen|sg", "correct"),
      event(NOW - 5 * 60_000, "cases:d|gen|sg", "wrong"),
    ].reduce(apply, EMPTY_PROGRESS);
    expect(todayCount(p, NOW)).toEqual({ answered: 3, correct: 2 });
    expect(todayCount(p, startOfDay(NOW, 1))).toEqual({ answered: 0, correct: 0 });
    // b went wrong yesterday (overdue), d five minutes ago (not yet)
    expect(dueCards(p, NOW)).toEqual(["cases:b|gen|sg"]);
    expect(cardsDue(p, NOW + 10 * 60_000)).toBe(2);
    expect(dueCards(p, startOfDay(NOW, 1))).toEqual(["cases:b|gen|sg", "cases:d|gen|sg", "cases:c|gen|sg"]);
    expect(introducedToday(p, NOW)).toBe(2);
  });
});

describe("levelCap", () => {
  const cards = (level: Level, n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `cases:${level}${i}|gen|sg`, skill: "cases:gen|sg", level, freq: 1 as const }));
  const source: CardSource = {
    all: () => [...cards("A1", 10), ...cards("A2", 5)],
    build: () => null,
    skillLabel: (s) => s,
  };
  const answer = (ids: string[], verdict: Verdict) => ids.map((id) => event(NOW, id, verdict));

  it("starts at A1 and opens A2 at 80% seen with 70% right", () => {
    const a1 = cards("A1", 10).map((c) => c.id);
    expect(levelCap(EMPTY_PROGRESS, { cases: source })).toBe("A1");
    expect(levelCap(replay(answer(a1.slice(0, 7), "correct")), { cases: source })).toBe("A1");
    expect(levelCap(replay(answer(a1.slice(0, 8), "correct")), { cases: source })).toBe("A2");
    const shaky = replay([...answer(a1.slice(0, 5), "correct"), ...answer(a1.slice(5, 8), "wrong")]);
    expect(levelCap(shaky, { cases: source })).toBe("A1");
  });

  it("is A1 with no cards at all", () => {
    expect(levelCap(EMPTY_PROGRESS, {})).toBe("A1");
  });
});

describe("streak", () => {
  const GOAL = 20;
  /** Progress whose day counts are `answered` for each day offset from today. */
  const days = (counts: Record<number, number>): Progress => {
    const out: Record<string, DayCount> = {};
    for (const [offset, answered] of Object.entries(counts)) {
      out[addDays(TODAY, Number(offset))] = { answered, correct: answered };
    }
    return { ...EMPTY_PROGRESS, days: out };
  };
  const met = (...offsets: number[]) => Object.fromEntries(offsets.map((o) => [o, GOAL]));

  it("is empty with no history", () => {
    expect(streak(EMPTY_PROGRESS, GOAL, NOW)).toEqual({
      current: 0,
      best: 0,
      today: false,
      graceUsed: false,
      graceDay: null,
    });
  });

  it("counts consecutive goal days, today included once met", () => {
    expect(streak(days(met(0, -1, -2)), GOAL, NOW)).toMatchObject({ current: 3, best: 3, today: true });
  });

  it("does not break while today is still in progress", () => {
    expect(streak(days({ ...met(-1, -2), 0: 5 }), GOAL, NOW)).toMatchObject({ current: 2, today: false });
  });

  it("needs the goal, not just some answers", () => {
    expect(streak(days({ 0: GOAL - 1, [-1]: GOAL }), GOAL, NOW).current).toBe(1);
    expect(streak(days({ 0: 10 }), 10, NOW).current).toBe(1);
  });

  it("bridges a single missed day with a grace day, which does not add to it", () => {
    const s = streak(days(met(0, -2, -3)), GOAL, NOW);
    expect(s).toMatchObject({ current: 3, graceUsed: true, graceDay: addDays(TODAY, -1) });
  });

  it("holds yesterday's miss as a grace day while today is in progress", () => {
    expect(streak(days(met(-2, -3)), GOAL, NOW)).toMatchObject({
      current: 2,
      graceUsed: true,
      graceDay: addDays(TODAY, -1),
    });
  });

  it("breaks on two missed days in a row", () => {
    expect(streak(days(met(0, -3, -4)), GOAL, NOW).current).toBe(1);
    expect(streak(days(met(-3, -4)), GOAL, NOW).current).toBe(0);
  });

  it("allows one grace day in any 7 days", () => {
    // misses at -1 and -5: four days apart, the second one breaks it
    expect(streak(days(met(0, -2, -3, -4, -6, -7)), GOAL, NOW).current).toBe(4);
    // misses at -1 and -8: seven days apart, both are bridged
    const s = streak(days(met(0, -2, -3, -4, -5, -6, -7, -9, -10)), GOAL, NOW);
    expect(s.current).toBe(9);
    expect(s.graceDay).toBe(addDays(TODAY, -1));
  });

  it("does not report an old grace day as in use", () => {
    const s = streak(days(met(0, -1, -2, -3, -4, -5, -6, -7, -9)), GOAL, NOW);
    expect(s).toMatchObject({ current: 9, graceUsed: false, graceDay: addDays(TODAY, -8) });
  });

  it("does not start a streak with a grace day", () => {
    expect(streak(days(met(-2)), GOAL, NOW).current).toBe(1);
    expect(streak(days(met(-3)), GOAL, NOW).current).toBe(0);
  });

  it("remembers the best streak", () => {
    const s = streak(days(met(0, -1, -20, -21, -22, -23, -24, -26, -27)), GOAL, NOW);
    expect(s).toMatchObject({ current: 2, best: 7 });
  });

  it("uses local days from the log", () => {
    const late = startOfDay(NOW) - 60_000; // 23:59 yesterday, local
    const log = Array.from({ length: GOAL }, (_, i) => event(late + i, `cases:w${i}|gen|sg`, "correct"));
    const s = streak(replay(log), GOAL, NOW);
    expect(s).toMatchObject({ current: 1, today: false });
    expect(streak(replay(log), GOAL, late).today).toBe(true);
  });
});

describe("weakSpots", () => {
  const label = (skill: string) => `label ${skill}`;
  const answers = (skill: string, right: number, wrong: number, t = NOW, miss: MissKind = "ending") => [
    ...Array.from({ length: right }, (_, i) => event(t, `${skill.split(":")[0]}:r${i}|x`, "correct", { skill })),
    ...Array.from({ length: wrong }, (_, i) => event(t, `${skill.split(":")[0]}:w${i}|x`, "wrong", { skill, miss })),
  ];

  it("lists skills with ≥ 5 answers, lowest accuracy first, with their misses", () => {
    const p = replay([
      ...answers("cases:ins|pl", 2, 4),
      ...answers("cases:gen|pl", 4, 2, NOW, "case"),
      event(NOW, "cases:z|x", "wrong", { skill: "cases:gen|pl", miss: "typo" }),
      ...answers("verbs:past|3pl", 1, 3), // only 4 answers
      ...answers("pronouns:acc|sg", 5, 0),
      ...answers("unknown:skill", 0, 9),
    ]);
    const spots = weakSpots(p, NOW, 5, { label });
    expect(spots.map((s) => s.skill)).toEqual(["cases:ins|pl", "cases:gen|pl", "pronouns:acc|sg"]);
    expect(spots[0]).toEqual({
      skill: "cases:ins|pl",
      drill: "cases",
      label: "label cases:ins|pl",
      correct: 2,
      total: 6,
      misses: [{ kind: "ending", count: 4 }],
    });
    expect(spots[1].misses).toEqual([
      { kind: "case", count: 2 },
      { kind: "typo", count: 1 },
    ]);
    expect(weakSpots(p, NOW, 1, { label })).toHaveLength(1);
  });

  it("only looks at the last 30 days", () => {
    const old = startOfDay(NOW, -30) + HOUR;
    const edge = startOfDay(NOW, -29) + HOUR;
    const p = replay([...answers("cases:ins|pl", 0, 6, old), ...answers("cases:gen|pl", 0, 5, edge)]);
    expect(weakSpots(p, NOW, 5, { label }).map((s) => s.skill)).toEqual(["cases:gen|pl"]);
  });

  it("labels through the registry by default", () => {
    const p = replay(answers("cases:ins|pl", 0, 5));
    expect(typeof weakSpots(p, NOW)[0].label).toBe("string");
  });
});
