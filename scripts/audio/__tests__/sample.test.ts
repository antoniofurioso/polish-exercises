import { describe, expect, it } from "vitest";
import { DRILLS } from "../../../lib/drills";
import { renderPrompt, renderSolution } from "../../../lib/generate";
import { spokenGap } from "../../../lib/speak";
import { DRILL_KINDS } from "../../../lib/types";
import { SPELL_CAP, sampleDrill, spoken, variants } from "../sample";

const quick = { sessions: 2, patience: 1, maxRounds: 1, seed: 7, spellMax: SPELL_CAP };

describe("audio sampling", () => {
  it("speaks what the exercise card speaks: the gapped prompt, then the solution", () => {
    const [exercise] = DRILLS.cases.build({ ...DRILLS.cases.mix, count: 1 }, 3);
    expect(spoken(exercise)).toEqual([spokenGap(renderPrompt(exercise)), renderSolution(exercise)]);
    expect(spoken(exercise)[0]).toContain("…");
    expect(spoken(exercise)[0]).not.toContain("___");
  });

  it("covers every setting that changes what a drill says", () => {
    const labels = (kind: (typeof DRILL_KINDS)[number]) => variants(kind).map((v) => v.label);
    expect(labels("cases")).toContain("voc/pl/adjectives");
    expect(labels("pronouns")).toContain("loc/pl/tamten");
    expect(labels("verbs")).toContain("imperative/sg/reflexive");
    expect(labels("numbers")).toEqual(expect.arrayContaining(["count", "numeral/ins", "ordinal/gen", `spell/${SPELL_CAP}`]));
    expect(variants("numbers", 9999).map((v) => v.label)).toContain("spell/9999");
    for (const kind of DRILL_KINDS) expect(labels(kind)[0]).toBe("mix");
  });

  it("collects distinct sentences from every drill", () => {
    for (const kind of DRILL_KINDS) {
      const sample = sampleDrill(kind, quick);
      expect(sample.strings.size, kind).toBeGreaterThan(5);
      expect([...sample.strings].some((s) => s.includes("___")), kind).toBe(false);
    }
  });
});
