import { describe, expect, it } from "vitest";
import type { CardInfo, CardSource } from "../cards";
import type { Verdict } from "../grade";
import { apply, DEFAULT_SETTINGS, EMPTY_PROGRESS, replay } from "../progress";
import type { AnswerEvent, Progress, Sources } from "../progress";
import { dayKey, startOfDay } from "../srs";
import { buildToday, cardSeed, daySeed, isUnfinished, orderNew, resumableToday } from "../today";
import type { RunState, SavedToday } from "../today";
import type { TodayOptions } from "../today";
import type { DrillKind, Exercise, Freq, Level } from "../types";

const DAY1 = new Date(2026, 9, 9, 9, 0).getTime();
const DAY2 = startOfDay(DAY1, 1) + 9 * 3_600_000;
const HOUR = 3_600_000;

const card = (drill: DrillKind, name: string, level: Level = "A1", freq: Freq = 1, skill = "s"): CardInfo => ({
  id: `${drill}:${name}`,
  skill: `${drill}:${skill}`,
  level,
  freq,
});

/** A fake drill: its cards in file order; `broken` ones can no longer be built. */
function fake(cards: CardInfo[], broken: string[] = []): CardSource {
  return {
    all: (max) => cards.filter((c) => !max || ["A1", "A2", "B1", "B2"].indexOf(c.level) <= ["A1", "A2", "B1", "B2"].indexOf(max)),
    build: (id, seed, answerMode) => {
      const info = cards.find((c) => c.id === id);
      if (!info || broken.includes(id)) return null;
      const exercise: Exercise = {
        id: `q${seed}`,
        case: "nom",
        number: "sg",
        before: "",
        after: "",
        tokens: [],
        hint: id,
        en: "",
        answers: ["x"],
        note: "",
        card: id,
        skill: info.skill,
        ...(answerMode === "choice" ? { options: ["x", "y"] } : {}),
      };
      return exercise;
    },
    skillLabel: (s) => s,
  };
}

/** Three drills, each with A1 cards of freq 1 and 2, and some A2 ones, in `all()` order. */
function registry(): Sources {
  const make = (drill: DrillKind) => [
    ...Array.from({ length: 4 }, (_, i) => card(drill, `a1f1-${i}`, "A1", 1, `k${i % 2}`)),
    ...Array.from({ length: 8 }, (_, i) => card(drill, `a1f2-${i}`, "A1", 2, `k${i % 2}`)),
    ...Array.from({ length: 6 }, (_, i) => card(drill, `a2-${i}`, "A2", 1, "k9")),
  ];
  return { cases: fake(make("cases")), pronouns: fake(make("pronouns")), verbs: fake(make("verbs")) };
}

const opts = (extra: Partial<TodayOptions> = {}): TodayOptions => ({
  settings: DEFAULT_SETTINGS,
  sources: registry(),
  ...extra,
});

/** Answers every exercise of a session at `t`, one second apart. */
function answer(progress: Progress, exercises: Exercise[], t: number, verdict: (e: Exercise) => Verdict = () => "correct") {
  const events: AnswerEvent[] = exercises.map((e, i) => ({
    t: t + i * 1000,
    day: dayKey(t + i * 1000),
    card: e.card!,
    skill: e.skill!,
    verdict: verdict(e),
    drill: e.kind!,
    case: e.case,
  }));
  return events.reduce(apply, progress);
}

describe("buildToday", () => {
  it("gives a first-time learner A1 new cards across drills, everyday words first", () => {
    const plan = buildToday(EMPTY_PROGRESS, DAY1, 1, opts());
    // nothing else to practise yet, so new cards fill the whole goal, not just the budget
    expect(plan).toMatchObject({ due: 0, fresh: 20, extra: 0, extraOnly: false, level: "A1", size: 20, newLeft: 10 });
    expect(plan.exercises).toHaveLength(20);
    const cards = plan.exercises.map((e) => e.card!);
    expect(cards.every((c) => c.includes(":a1"))).toBe(true);
    expect(cards.filter((c) => c.includes(":a1f1-"))).toHaveLength(12);
    expect(new Set(plan.exercises.map((e) => e.kind))).toEqual(new Set(["cases", "pronouns", "verbs"]));
  });

  it("orders new cards by level, then drill round robin, each drill in its all() order", () => {
    const order = orderNew([
      [card("cases", "x", "A1", 2), card("cases", "y", "A1", 1), card("cases", "z", "A1", 1)],
      [card("verbs", "p", "A2", 1), card("verbs", "q", "A1", 1)],
    ]).map((c) => c.id);
    expect(order).toEqual(["cases:x", "verbs:q", "cases:y", "cases:z", "verbs:p"]);
  });

  it("does not introduce the same word or skill twice in a row within a drill", () => {
    const order = orderNew([
      [
        { id: "cases:kot|nom|sg", skill: "cases:nom|sg", level: "A1", freq: 1 },
        { id: "cases:kot|acc|sg", skill: "cases:acc|sg", level: "A1", freq: 1 },
        { id: "cases:pies|nom|sg", skill: "cases:nom|sg", level: "A1", freq: 1 },
        { id: "cases:pies|acc|sg", skill: "cases:acc|sg", level: "A1", freq: 1 },
      ],
    ]).map((c) => c.id);
    expect(order).toEqual(["cases:kot|nom|sg", "cases:pies|acc|sg", "cases:kot|acc|sg", "cases:pies|nom|sg"]);
  });

  it("marks each exercise with its drill, card and skill, ids prefixed and unique", () => {
    const plan = buildToday(EMPTY_PROGRESS, DAY1, 1, opts({ settings: { goal: 20, newPerDay: 20 } }));
    for (const e of plan.exercises) {
      expect(e.card!.startsWith(`${e.kind}:`)).toBe(true);
      expect(e.id.startsWith(`${e.kind}:`)).toBe(true);
      expect(e.skill!.startsWith(`${e.kind}:`)).toBe(true);
    }
    expect(new Set(plan.exercises.map((e) => e.id)).size).toBe(plan.exercises.length);
  });

  it("builds each card with a seed derived from the session seed and the card", () => {
    const plan = buildToday(EMPTY_PROGRESS, DAY1, 7, opts());
    for (const e of plan.exercises) expect(e.id).toBe(`${e.kind}:q${cardSeed(7, e.card!)}`);
  });

  it("is deterministic in progress, time and seed", () => {
    const a = buildToday(EMPTY_PROGRESS, DAY1, 3, opts());
    const b = buildToday(EMPTY_PROGRESS, DAY1, 3, opts());
    const c = buildToday(EMPTY_PROGRESS, DAY1, 4, opts());
    expect(a).toEqual(b);
    expect(c.exercises.map((e) => e.card)).toEqual(a.exercises.map((e) => e.card));
    expect(c.exercises.map((e) => e.id)).not.toEqual(a.exercises.map((e) => e.id));
  });

  it("puts yesterday's cards first the next day", () => {
    const first = buildToday(EMPTY_PROGRESS, DAY1, 1, opts());
    const progress = answer(EMPTY_PROGRESS, first.exercises, DAY1);
    const plan = buildToday(progress, DAY2, 2, opts());
    // 20 cards met yesterday are all due; reviews take 70% while new cards remain
    expect(plan).toMatchObject({ due: 14, fresh: 6, extraOnly: false, dueTotal: 20, newLeft: 10 });
    const seen = new Set(first.exercises.map((e) => e.card));
    expect(plan.exercises.slice(0, 14).every((e) => seen.has(e.card))).toBe(true);
    expect(plan.exercises.slice(14).every((e) => !seen.has(e.card))).toBe(true);
  });

  it("takes the most overdue reviews first", () => {
    const cards = Array.from({ length: 5 }, (_, i) => card("cases", `c${i}`));
    const sources = { cases: fake(cards) };
    // c0 answered last (least overdue) … c4 first (most overdue), all wrong → due 10 min later
    let progress: Progress = EMPTY_PROGRESS;
    cards.forEach((c, i) => {
      progress = apply(progress, {
        t: DAY1 - i * HOUR,
        day: dayKey(DAY1 - i * HOUR),
        card: c.id,
        skill: c.skill,
        verdict: "wrong",
        drill: "cases",
        case: "nom",
      });
    });
    const plan = buildToday(progress, DAY1 + HOUR, 1, { settings: DEFAULT_SETTINGS, sources });
    expect(plan.exercises.map((e) => e.card)).toEqual(["cases:c4", "cases:c3", "cases:c2", "cases:c1", "cases:c0"]);
    expect(plan.due).toBe(5);
  });

  it("caps reviews at 70% of the session while new cards are available", () => {
    let progress = EMPTY_PROGRESS;
    // three days of all-new sessions: 30 cards seen, all due by day 4 after a wrong answer
    const sources = registry();
    const all = Object.values(sources).flatMap((s) => s!.all("A1")).slice(0, 30);
    progress = replay(
      all.map((c, i) => ({
        t: DAY1 - 3 * 24 * HOUR + i,
        day: dayKey(DAY1 - 3 * 24 * HOUR),
        card: c.id,
        skill: c.skill,
        verdict: "wrong" as const,
        drill: c.id.split(":")[0] as DrillKind,
        case: "nom" as const,
      })),
    );
    const plan = buildToday(progress, DAY1, 1, opts({ sources }));
    expect(plan).toMatchObject({ due: 14, fresh: 6, extra: 0, dueTotal: 30 });
    // with no new card left to give, reviews fill the session
    const noNew = buildToday(progress, DAY1, 1, opts({ sources, settings: { goal: 20, newPerDay: 0 } }));
    expect(noNew).toMatchObject({ due: 20, fresh: 0, extraOnly: false });
  });

  it("spends only what is left of today's new-card budget", () => {
    const first = buildToday(EMPTY_PROGRESS, DAY1, 1, opts({ settings: { goal: 7, newPerDay: 10 } }));
    expect(first.fresh).toBe(7);
    const progress = answer(EMPTY_PROGRESS, first.exercises, DAY1);
    const later = buildToday(progress, DAY1 + 2 * HOUR, 1, opts());
    // 3 new from the budget, the 7 cards seen earlier today as filler, then new cards to the goal
    expect(later).toMatchObject({ newLeft: 3, fresh: 13, due: 0, extra: 7 });
    expect(later.exercises).toHaveLength(20);
  });

  it("switches to extra practice when nothing is due and the budget is spent", () => {
    const first = buildToday(EMPTY_PROGRESS, DAY1, 1, opts({ settings: { goal: 20, newPerDay: 20 } }));
    // pronouns answered wrong in the morning, the rest right
    const progress = answer(EMPTY_PROGRESS, first.exercises, DAY1, (e) => (e.kind === "pronouns" ? "wrong" : "correct"));
    const pronounCards = first.exercises.filter((e) => e.kind === "pronouns").length;
    expect(pronounCards).toBeGreaterThan(0);
    // relearn them in the afternoon (now right), so nothing is due
    const relearned = answer(progress, first.exercises.filter((e) => e.kind === "pronouns"), DAY1 + 3 * HOUR);
    const plan = buildToday(relearned, DAY1 + 5 * HOUR, 1, opts({ settings: { goal: 10, newPerDay: 20 } }));
    expect(plan).toMatchObject({ extraOnly: true, due: 0, fresh: 0, newLeft: 0, extra: 10 });
    // the weakest skills (pronouns, 50%) come before the rest
    expect(plan.exercises.slice(0, 1).every((e) => e.kind === "pronouns")).toBe(true);
    expect(plan.exercises.filter((e) => e.kind === "pronouns")).toHaveLength(5);
  });

  it("finds a weak skill's cards when the logged skill is finer than the card's (verbs)", () => {
    // verbs cards carry "verbs:past"; their exercises (and so the log) carry "verbs:past|3pl"
    const verbs = Array.from({ length: 4 }, (_, i) => card("verbs", `v${i}`, "A1", 1, "past"));
    const verbSource = fake(verbs);
    const sources: Sources = {
      cases: fake(Array.from({ length: 4 }, (_, i) => card("cases", `c${i}`))),
      verbs: {
        ...verbSource,
        build: (id, seed) => {
          const e = verbSource.build(id, seed);
          return e && { ...e, skill: "verbs:past|3pl" };
        },
      },
    };
    const settings = { goal: 8, newPerDay: 8 };
    const first = buildToday(EMPTY_PROGRESS, DAY1, 1, { settings, sources });
    expect(first.exercises.filter((e) => e.skill === "verbs:past|3pl")).toHaveLength(4);
    // verbs wrong then relearned, cases right: verbs:past|3pl is the weak skill at 50%
    const wrong = answer(EMPTY_PROGRESS, first.exercises, DAY1, (e) => (e.kind === "verbs" ? "wrong" : "correct"));
    const relearned = answer(wrong, first.exercises.filter((e) => e.kind === "verbs"), DAY1 + HOUR);
    // half the session from the weak skill; by due date alone it would be all cases (ids sort first)
    const plan = buildToday(relearned, DAY1 + 2 * HOUR, 1, { settings: { goal: 4, newPerDay: 8 }, sources });
    expect(plan.extraOnly).toBe(true);
    expect(plan.exercises.map((e) => e.kind)).toEqual(["verbs", "cases", "verbs", "cases"]);
  });

  it("returns an empty plan when there is nothing at all", () => {
    expect(buildToday(EMPTY_PROGRESS, DAY1, 1, { settings: DEFAULT_SETTINGS, sources: {} })).toMatchObject({
      exercises: [],
      extraOnly: true,
      level: "A1",
    });
  });

  it("skips cards that can no longer be built and takes the next", () => {
    const cards = Array.from({ length: 6 }, (_, i) => card("cases", `c${i}`));
    const plan = buildToday(EMPTY_PROGRESS, DAY1, 1, {
      settings: { goal: 4, newPerDay: 4 },
      sources: { cases: fake(cards, ["cases:c0", "cases:c2"]) },
    });
    expect(plan.exercises.map((e) => e.card)).toEqual(["cases:c1", "cases:c3", "cases:c4", "cases:c5"]);
    expect(plan.fresh).toBe(4);
  });

  it("interleaves drills so the same one rarely comes twice in a row", () => {
    const first = buildToday(EMPTY_PROGRESS, DAY1, 1, opts({ settings: { goal: 30, newPerDay: 30 } }));
    const progress = answer(EMPTY_PROGRESS, first.exercises, DAY1);
    const plan = buildToday(progress, DAY2 + 30 * 24 * HOUR, 5, opts({ settings: { goal: 30, newPerDay: 0 } }));
    expect(plan.exercises).toHaveLength(30);
    const repeats = plan.exercises.filter((e, i) => i > 0 && plan.exercises[i - 1].kind === e.kind).length;
    expect(repeats).toBe(0);
  });

  it("only uses the chosen drills, and passes the answer mode on", () => {
    const plan = buildToday(EMPTY_PROGRESS, DAY1, 1, opts({ drills: ["verbs"], answerMode: "choice" }));
    // all 12 A1 verbs cards: 10 from the budget, 2 more to get as close to the goal as A1 allows
    expect(plan.exercises.length).toBe(12);
    expect(plan.exercises.every((e) => e.kind === "verbs" && e.options)).toBe(true);
  });

  it("opens A2 new cards once A1 is learnt", () => {
    const sources = registry();
    const a1 = Object.values(sources).flatMap((s) => s!.all("A1"));
    const progress = replay(
      a1.map((c, i) => ({
        t: DAY1 - 24 * HOUR + i,
        day: dayKey(DAY1 - 24 * HOUR),
        card: c.id,
        skill: c.skill,
        verdict: "correct" as const,
        drill: c.id.split(":")[0] as DrillKind,
        case: "nom" as const,
      })),
    );
    const plan = buildToday(progress, DAY1 + 30 * 24 * HOUR, 1, opts({ settings: { goal: 40, newPerDay: 5 } }));
    expect(plan.level).toBe("A2");
    expect(plan.exercises.filter((e) => e.card!.includes(":a2-"))).toHaveLength(plan.fresh);
    expect(plan.fresh).toBe(5);
  });

  it("works on the registry's card sources", () => {
    const plan = buildToday(EMPTY_PROGRESS, DAY1, daySeed(dayKey(DAY1)), { settings: DEFAULT_SETTINGS });
    expect(plan.level).toBe("A1");
    for (const e of plan.exercises) {
      expect(e.kind && e.card && e.skill).toBeTruthy();
      expect(e.id.startsWith(`${e.kind}:`)).toBe(true);
    }
    expect(plan.exercises.length).toBe(plan.fresh);
  });
});

describe("resumableToday", () => {
  const ex = (id: string): Exercise => ({
    id,
    case: "nom",
    number: "sg",
    before: "",
    after: "",
    tokens: [],
    hint: id,
    en: "",
    answers: ["x"],
    note: "",
  });
  const plan = { exercises: [ex("a"), ex("b"), ex("c")], due: 1, fresh: 2, extra: 0, extraOnly: false, level: "A1" as const, size: 3, dueTotal: 1, newLeft: 2 };
  // "a" answered wrong and re-asked at position 3; "b" answered right; "c" is next
  const run: RunState = { exercises: [...plan.exercises, ex("a")], reasks: [3], next: 2, verdicts: ["wrong", "correct"] };
  const saved: SavedToday = { v: 1, day: "2026-10-10", round: 0, plan, run };

  it("resumes the same day's unfinished session", () => {
    expect(resumableToday(saved, "2026-10-10")).toBe(saved);
    expect(resumableToday(JSON.parse(JSON.stringify(saved)), "2026-10-10")).toEqual(saved);
  });

  it("ignores another day's session", () => {
    expect(resumableToday(saved, "2026-10-11")).toBeNull();
  });

  it("does not resume a finished session", () => {
    expect(resumableToday({ ...saved, run: { ...run, next: 4, verdicts: ["wrong", "correct", "correct"] } }, "2026-10-10")).toBeNull();
  });

  it("rejects corrupt saves", () => {
    for (const bad of [null, "x", [], { ...saved, v: 2 }, { ...saved, round: -1 }, { ...saved, plan: {} }]) {
      expect(resumableToday(bad, "2026-10-10")).toBeNull();
    }
  });

  it("checks that the scored verdicts match the answered, non-re-asked positions", () => {
    expect(isUnfinished(run)).toBe(true);
    // a re-ask answered: not scored, so no extra verdict
    expect(isUnfinished({ ...run, reasks: [2], exercises: [ex("a"), ex("b"), ex("a"), ex("c")], next: 3 })).toBe(true);
    expect(isUnfinished({ ...run, verdicts: ["wrong"] })).toBe(false);
    expect(isUnfinished({ ...run, verdicts: ["wrong", "maybe"] })).toBe(false);
    expect(isUnfinished({ ...run, reasks: [9] })).toBe(false);
    expect(isUnfinished({ ...run, exercises: [{ id: 1 }] })).toBe(false);
  });
});
