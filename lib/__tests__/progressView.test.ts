import { describe, expect, it } from "vitest";
import { EMPTY_PROGRESS, type Progress } from "../progress";
import { dueCount, lastDays, MISS_LABELS, missLabel, safely, skillConfig, skillHref } from "../progressView";
import { parseSession } from "../session";
import { dayKey } from "../srs";
import { MISS_KINDS } from "../types";

describe("miss kind labels", () => {
  it("has a plain-English label for every miss kind", () => {
    for (const kind of MISS_KINDS) {
      expect(MISS_LABELS[kind]).toMatch(/^[a-z]/);
      expect(missLabel(kind)).toBe(MISS_LABELS[kind]);
    }
    expect(new Set(Object.values(MISS_LABELS)).size).toBe(MISS_KINDS.length);
  });
});

describe("weak skill → configured session", () => {
  const parsed = (skill: string) => {
    const href = skillHref(skill, 7);
    expect(href).toMatch(/^\/practice\?/);
    return parseSession(new URLSearchParams(href!.slice("/practice?".length)))!;
  };

  it("drills one case and number for the cases drill", () => {
    const { config, seed } = parsed("cases:ins|pl");
    expect(seed).toBe(7);
    expect(config).toMatchObject({ cases: ["ins"], numbers: ["pl"], mode: "nouns", count: 20 });
    expect(config.kind).toBeUndefined(); // the cases drill is the default
  });

  it("drills one case and number for pronouns and possessives", () => {
    expect(parsed("pronouns:gen|sg").config).toMatchObject({ kind: "pronouns", cases: ["gen"], numbers: ["sg"] });
    expect(parsed("possessives:loc|pl").config).toMatchObject({ kind: "possessives", cases: ["loc"], numbers: ["pl"] });
  });

  it("drills one tense for verbs, narrowed by the person's number", () => {
    expect(parsed("verbs:past|3pl").config).toMatchObject({ kind: "verbs", tenses: ["past"], numbers: ["pl"] });
    expect(parsed("verbs:imperative|2sg").config).toMatchObject({ tenses: ["imperative"], numbers: ["sg"] });
    expect(skillConfig("verbs:future|x")?.numbers).toEqual(["sg", "pl"]);
  });

  it("drills one sub-drill for numbers", () => {
    expect(parsed("numbers:count|2-4").config).toMatchObject({ kind: "numbers", drills: ["count"] });
    expect(parsed("numbers:ordinal|date").config).toMatchObject({ drills: ["ordinal"] });
  });

  it("returns null for skills no configurator can narrow to", () => {
    for (const skill of ["", "cases", "cases:xyz|pl", "cases:gen|du", "pronouns:voc|sg", "numbers:roman|x", "verbs:pluperfect|1sg", "shuffle:gen|sg"]) {
      expect(skillConfig(skill)).toBeNull();
      expect(skillHref(skill, 1)).toBeNull();
    }
  });
});

describe("lastDays", () => {
  it("lists the last n local days, oldest first, with their counts", () => {
    const now = new Date(2026, 9, 9, 15, 30).getTime();
    const days = lastDays({ "2026-10-09": { answered: 20, correct: 18 }, "2026-10-01": { answered: 3, correct: 1 } }, now, 28);
    expect(days).toHaveLength(28);
    expect(days[27]).toEqual({ day: "2026-10-09", answered: 20, correct: 18 });
    expect(days[0].day).toBe("2026-09-12");
    expect(days.find((d) => d.day === "2026-10-01")?.answered).toBe(3);
    expect(days.find((d) => d.day === "2026-10-02")?.answered).toBe(0);
    expect(new Set(days.map((d) => d.day)).size).toBe(28);
  });

  it("crosses a month and year boundary", () => {
    const days = lastDays({}, new Date(2026, 0, 2, 9).getTime(), 3);
    expect(days.map((d) => d.day)).toEqual(["2025-12-31", "2026-01-01", "2026-01-02"]);
    expect(dayKey(new Date(2026, 0, 2, 9).getTime())).toBe("2026-01-02");
  });
});

describe("dueCount", () => {
  it("counts the cards due at the given time", () => {
    const card = (due: number) => ({ due, interval: 1, ease: 2.5, reps: 1, lapses: 0, first: 0, last: 0, seen: 1, right: 1 });
    const progress: Progress = { ...EMPTY_PROGRESS, cards: { a: card(100), b: card(200), c: card(300) } };
    expect(dueCount(progress, 200)).toBe(2);
    expect(dueCount(EMPTY_PROGRESS, 200)).toBe(0);
  });
});

describe("safely", () => {
  it("returns the fallback when the call throws", () => {
    expect(safely(() => 1, 0)).toBe(1);
    expect(
      safely(() => {
        throw new Error("not implemented");
      }, 0),
    ).toBe(0);
  });
});
