import { describe, expect, it } from "vitest";
import { parseSession, sessionParams } from "../session";
import { buildShuffleSession } from "../shuffle";
import type { Config } from "../types";

const config: Config = { kind: "shuffle", cases: ["nom"], numbers: ["sg"], mode: "nouns", count: 50 };

describe("shuffle session", () => {
  it("mixes every drill, tagged and with unique ids", () => {
    const exercises = buildShuffleSession(config, 7);
    expect(exercises.length).toBeGreaterThanOrEqual(45);
    const kinds = new Set(exercises.map((e) => e.kind));
    expect([...kinds].sort()).toEqual(["cases", "numbers", "possessives", "pronouns", "verbs"]);
    expect(new Set(exercises.map((e) => e.id)).size).toBe(exercises.length);
  });

  it("only draws from the chosen drills", () => {
    const exercises = buildShuffleSession({ ...config, mix: ["verbs", "numbers"] }, 3);
    expect(exercises.every((e) => e.kind === "verbs" || e.kind === "numbers")).toBe(true);
  });

  it("is deterministic per seed", () => {
    expect(buildShuffleSession(config, 11).map((e) => e.id)).toEqual(
      buildShuffleSession(config, 11).map((e) => e.id),
    );
  });

  it("gives options in multiple-choice mode", () => {
    const exercises = buildShuffleSession({ ...config, answerMode: "choice" }, 5);
    expect(exercises.filter((e) => e.options).length).toBeGreaterThan(exercises.length / 2);
  });

  it("round-trips through the URL", () => {
    const withMix: Config = { ...config, mix: ["cases", "verbs"] };
    expect(parseSession(new URLSearchParams(sessionParams(withMix, 9)))).toEqual({
      config: withMix,
      seed: 9,
    });
  });
});
