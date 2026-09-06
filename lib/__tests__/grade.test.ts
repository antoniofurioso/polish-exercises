import { describe, expect, it } from "vitest";
import { grade } from "../grade";
import type { Exercise } from "../types";

const ex: Exercise = {
  id: "t", case: "ins", number: "sg",
  before: "Idę z ", after: ".",
  tokens: [{ text: "czarnym", blank: true }, { text: "kotem", blank: true }],
  hint: "czarny kot", en: "I'm going with the black cat.",
  answers: ["czarnym kotem"], note: "",
};

describe("grade", () => {
  it("accepts the exact answer regardless of case and spacing", () => {
    expect(grade("czarnym kotem", ex)).toBe("correct");
    expect(grade(" Czarnym  Kotem ", ex)).toBe("correct");
    expect(grade("czarnym kotem.", ex)).toBe("correct");
  });

  it("flags a missing diacritic instead of a plain miss", () => {
    const acc: Exercise = { ...ex, answers: ["kotą"], tokens: [{ text: "kotą", blank: true }] };
    expect(grade("kota", acc)).toBe("diacritics");
    expect(grade("kotą", acc)).toBe("correct");
  });

  it("rejects a wrong form", () => {
    expect(grade("czarnego kota", ex)).toBe("wrong");
    expect(grade("", ex)).toBe("wrong");
  });

  it("accepts any listed variant", () => {
    const multi: Exercise = { ...ex, answers: ["rękami", "rękoma"] };
    expect(grade("rękoma", multi)).toBe("correct");
  });
});

describe("spokenGap", () => {
  it("reads a blank as a pause without stray punctuation", async () => {
    const { spokenGap } = await import("../speak");
    expect(spokenGap("Nie mam ___.")).toBe("Nie mam …");
    expect(spokenGap("Przy ___ stoi krzesło.")).toBe("Przy … stoi krzesło.");
    expect(spokenGap("Dzień dobry, ___!")).toBe("Dzień dobry, …");
  });
});
