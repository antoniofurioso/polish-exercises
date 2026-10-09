import { describe, expect, it } from "vitest";
import { buildSession } from "../generate";
import { missKindOf } from "../missKind";
import { buildVerbSession } from "../verbs";

describe("missKindOf", () => {
  it("classifies an empty answer", () => {
    const [ex] = buildSession({ cases: ["gen"], numbers: ["sg"], mode: "nouns", count: 1 }, 3);
    expect(missKindOf("", ex)).toBe("empty");
  });

  it("names another case of the same noun", () => {
    const [ex] = buildSession({ cases: ["ins"], numbers: ["sg"], mode: "nouns", count: 1 }, 5);
    expect(missKindOf(ex.source!.noun.sg.nom, ex)).toMatch(/^(case|accAnimacy)$/);
  });

  it("asks the verb diagnosis first for verb exercises", () => {
    const exercises = buildVerbSession(
      { kind: "verbs", tenses: ["present"], cases: ["nom"], numbers: ["sg", "pl"], mode: "nouns", count: 10 },
      7,
    );
    // a verb form from another exercise of the same tense is usually another person or another verb
    const kinds = exercises.map((ex, i) => missKindOf(exercises[(i + 1) % exercises.length].answers[0], ex));
    expect(kinds.every((k) => k !== undefined)).toBe(true);
  });
});
