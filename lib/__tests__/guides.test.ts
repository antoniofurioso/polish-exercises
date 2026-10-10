import { describe, expect, it } from "vitest";
import { exampleExercise, renderSolution } from "../generate";
import {
  aspectPairs,
  caseEndingTable,
  caseExamples,
  casePracticeHref,
  caseTriggers,
  conjugation,
  countTable,
  dateTable,
  exampleText,
  hourTable,
  numberExamples,
  numberPracticeHref,
  possessiveExamples,
  pronounExamples,
  reflexiveSample,
  sampleQuestions,
  toExample,
  verbExamples,
  verbPracticeHref,
} from "../guides";
import { parseSession } from "../session";
import { INDEXED_PATHS, TOPIC_PAGES, absoluteUrl, pageMetadata } from "../site";
import { TEMPLATES } from "../templates";
import { NOUNS } from "../nouns";
import { CASES, NUMBER_DRILLS, TENSES } from "../types";

/** The reference pages are built from the published lexicon: nothing may come back empty or broken. */
describe("guides", () => {
  it("builds an ending table for every case of every model noun", () => {
    const table = caseEndingTable();
    expect(table.rows.map((r) => r.kase)).toEqual([...CASES]);
    for (const row of table.rows) {
      expect(row.sg.every((f) => f.length > 0)).toBe(true);
      expect(row.pl.every((f) => f.length > 0 && f !== "—")).toBe(true);
    }
  });

  it("gives every case its triggers, each with an example built from a frame that states it", () => {
    for (const kase of CASES) {
      const triggers = caseTriggers(kase);
      expect(triggers.length).toBeGreaterThan(0);
      const notes = new Set(TEMPLATES.filter((t) => t.case === kase).map((t) => t.note));
      expect(triggers.map((t) => t.note).sort()).toEqual([...notes].sort());
      for (const t of triggers) {
        expect(t.example, `${kase}: ${t.note}`).not.toBeNull();
        expect(t.example!.parts.some((p) => p.key)).toBe(true);
        expect(t.example!.note).toBe(t.note);
      }
    }
  });

  it("builds a worked example exactly like a session does", () => {
    const tpl = TEMPLATES.find((t) => t.case === "gen")!;
    const noun = NOUNS.find((n) => n.lemma === "dom")!;
    const ex = exampleExercise(tpl, noun, "sg");
    expect(ex.answers[0]).toBe(noun.sg.gen);
    expect(exampleText(toExample(ex))).toBe(renderSolution(ex));
  });

  it("fills the example lists", () => {
    expect(caseExamples()).toHaveLength(6);
    expect(pronounExamples()).toHaveLength(4);
    expect(possessiveExamples()).toHaveLength(4);
    for (const drill of NUMBER_DRILLS) expect(numberExamples(drill).length).toBeGreaterThan(0);
    for (const tense of TENSES) expect(verbExamples(tense, ["pisać", "robić", "czytać"])).toHaveLength(3);
  });

  it("follows the 1 / 2–4 / 5+ rule in the counting table", () => {
    const table = countTable();
    const row = (n: number) => table.rows.find((r) => r.n === n)!.cells;
    // student, kot, kobieta, okno
    expect(row(2)[1]).toBe("dwa koty");
    expect(row(5)[1]).toBe("pięć kotów");
    expect(row(2)[2]).toBe("dwie kobiety");
    expect(row(2)[0]).toBe("dwóch studentów");
    expect(row(12)[1]).toBe("dwanaście kotów");
    expect(row(22)[1]).toBe("dwadzieścia dwa koty");
  });

  it("builds dates, hours, the model conjugation, aspect pairs and the reflexive sample", () => {
    expect(dateTable()[0].pl).toBe("pierwszego stycznia");
    expect(hourTable()[0]).toMatchObject({ nom: "pierwsza", loc: "pierwszej" });
    const c = conjugation();
    expect(c.nonPast[0]).toMatchObject({ present: "piszę", future: "napiszę" });
    expect(c.past).toHaveLength(12);
    expect(c.imperative.map((r) => r.pf)).toEqual(["napisz", "napiszmy", "napiszcie"]);
    expect(aspectPairs().length).toBeGreaterThan(5);
    expect(reflexiveSample().forms.every((f) => f.includes("się"))).toBe(true);
  });

  it("links to session URLs that parse back to the drill asked for", () => {
    const cases = parseSession(new URLSearchParams(casePracticeHref("gen").split("?")[1]));
    expect(cases?.config.cases).toEqual(["gen"]);
    const numbers = parseSession(new URLSearchParams(numberPracticeHref(["ordinal"]).split("?")[1]));
    expect(numbers?.config).toMatchObject({ kind: "numbers", drills: ["ordinal"] });
    const verbs = parseSession(new URLSearchParams(verbPracticeHref(["past"]).split("?")[1]));
    expect(verbs?.config).toMatchObject({ kind: "verbs", tenses: ["past"] });
  });

  it("has three multiple-choice sample questions for the landing page", () => {
    const samples = sampleQuestions();
    expect(samples).toHaveLength(3);
    for (const s of samples) {
      expect(s.options!.length).toBeGreaterThan(1);
      expect(s.source).toBeUndefined();
    }
  });
});

describe("site", () => {
  it("lists every topic page in the sitemap", () => {
    for (const page of TOPIC_PAGES) expect(INDEXED_PATHS).toContain(page.path);
  });

  it("points canonical and Open Graph URLs at the production domain", () => {
    // the tests run without NEXT_PUBLIC_SITE_URL, so BRAND.url is its default
    expect(absoluteUrl("/polish-cases")).toBe("https://polishup.app/polish-cases");
    expect(absoluteUrl("/")).toBe("https://polishup.app/");
    const meta = pageMetadata({ title: "T", description: "D", path: "/polish-cases" });
    expect(meta.alternates).toMatchObject({ canonical: "https://polishup.app/polish-cases" });
    expect(meta.openGraph).toMatchObject({ title: expect.stringContaining("T"), description: "D" });
  });
});
