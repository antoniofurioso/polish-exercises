import { describe, expect, it } from "vitest";
import { addDays, dayKey, dayNumber, INITIAL_EASE, MAX_EASE, MIN_EASE, RELEARN_MS, schedule, startOfDay } from "../srs";
import type { CardState } from "../srs";

// local time, so day boundaries are the device's whatever time zone the tests run in
const T0 = new Date(2026, 9, 9, 15, 30).getTime();

const run = (verdicts: ("correct" | "diacritics" | "wrong")[], t = T0): CardState => {
  let card: CardState | undefined;
  for (const v of verdicts) card = schedule(card, v, t);
  return card!;
};

describe("schedule", () => {
  it("starts a new card on a correct answer: one day, due at midnight", () => {
    const card = schedule(undefined, "correct", T0);
    expect(card).toEqual({
      due: startOfDay(T0, 1),
      interval: 1,
      ease: INITIAL_EASE + 0.05,
      reps: 1,
      lapses: 0,
      last: T0,
      first: T0,
      seen: 1,
      right: 1,
    });
  });

  it("grows the interval 1 → 3 → interval × ease", () => {
    const one = schedule(undefined, "correct", T0);
    const two = schedule(one, "correct", one.due);
    const three = schedule(two, "correct", two.due);
    expect([one.interval, two.interval, three.interval]).toEqual([1, 3, Math.round(3 * 2.6)]);
    expect(three.ease).toBeCloseTo(2.65);
    expect(three.due).toBe(startOfDay(two.due, three.interval));
    expect(three.first).toBe(T0);
    expect(three.seen).toBe(3);
  });

  it("treats a diacritics-only miss as a weaker pass", () => {
    const base = run(["correct", "correct"]); // interval 3, ease 2.6
    const card = schedule(base, "diacritics", T0);
    expect(card.interval).toBe(Math.round(3 * 1.2));
    expect(card.ease).toBeCloseTo(2.55);
    expect(card.reps).toBe(3);
    expect(card.right).toBe(3);
    expect(schedule(undefined, "diacritics", T0).interval).toBe(1);
  });

  it("sends a wrong card back in ten minutes and resets the reps", () => {
    const card = schedule(run(["correct", "correct", "correct"]), "wrong", T0);
    expect(card.due).toBe(T0 + RELEARN_MS);
    expect(card).toMatchObject({ interval: 0, reps: 0, lapses: 1, seen: 4, right: 3 });
    expect(card.ease).toBeCloseTo(2.65 - 0.2);
    // relearning starts the ladder again
    expect(schedule(card, "correct", T0).interval).toBe(1);
  });

  it("keeps ease between 1.3 and 3.0", () => {
    expect(run(Array(20).fill("wrong")).ease).toBe(MIN_EASE);
    expect(run(Array(30).fill("diacritics")).ease).toBe(MIN_EASE);
    expect(run(Array(30).fill("correct")).ease).toBe(MAX_EASE);
  });

  it("never stalls a card at one day", () => {
    const stuck = run(["diacritics", "diacritics", "diacritics"]);
    expect(stuck.interval).toBe(1);
    const next = schedule({ ...stuck, ease: MIN_EASE }, "correct", T0);
    expect(next.interval).toBe(2);
  });

  it("makes a pass due at local midnight, even right before midnight", () => {
    const late = new Date(2026, 9, 9, 23, 59, 30).getTime();
    const card = schedule(undefined, "correct", late);
    expect(card.due).toBe(new Date(2026, 9, 10).getTime());
    expect(dayKey(card.due)).toBe("2026-10-10");
    expect(startOfDay(card.due)).toBe(card.due);
  });
});

describe("day helpers", () => {
  it("counts calendar days across month and DST boundaries", () => {
    expect(dayNumber("2026-03-30") - dayNumber("2026-03-28")).toBe(2);
    expect(addDays("2026-10-09", -9)).toBe("2026-09-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    // the last Sunday of October is a 25-hour day in much of Europe
    expect(dayKey(startOfDay(new Date(2026, 9, 24, 12).getTime(), 2))).toBe("2026-10-26");
  });
});
