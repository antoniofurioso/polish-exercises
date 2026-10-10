import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRecords, toCsv } from "../review/csv";
import { REVIEW_FILES, applyVerdicts, drafts, entryId } from "../review/entries";
import type { DataFiles, Obj, ReviewRow } from "../review/entries";
import { COLUMNS, describeForms, reviewRows } from "../review/export";
import { entryLines, formatJson } from "../review/format";

const DATA = join(__dirname, "..", "..", "data");
const read = (file: string) => readFileSync(join(DATA, file), "utf8");
const readAll = (): DataFiles => Object.fromEntries(REVIEW_FILES.map((f) => [f, JSON.parse(read(f))]));

describe("csv", () => {
  const rows = [
    ["kind", "id", "forms", "verdict"],
    ["noun", "kot", "sg: nom=kot gen=kota\npl: nom=koty", ""],
    ["template", "acc/any: Widzę {NP}.", 'a "quoted", comma', " padded "],
    ["", "", "", ""],
  ];

  it("writes UTF-8 with a BOM, CRLF records and RFC 4180 quoting", () => {
    const text = toCsv(rows);
    expect(text.startsWith("﻿kind,id,forms,verdict\r\n")).toBe(true);
    expect(text).toContain('noun,kot,"sg: nom=kot gen=kota\npl: nom=koty",\r\n');
    expect(text).toContain('"a ""quoted"", comma"," padded "');
    expect(text.endsWith(",,,\r\n")).toBe(true);
  });

  it("reads back exactly what it wrote", () => {
    expect(parseCsv(toCsv(rows))).toEqual(rows.slice(0, 3).concat([["", "", "", ""]]));
  });

  it("reads LF files, no BOM, and Excel's semicolons", () => {
    expect(parseCsv('a,b\n1,"x\ny"\n')).toEqual([["a", "b"], ["1", "x\ny"]]);
    expect(parseCsv("kind;id;verdict\r\nnoun;kot;ok\r\n")).toEqual([["kind", "id", "verdict"], ["noun", "kot", "ok"]]);
    expect(parseCsv("a,b\n\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("keys records by the header, case-insensitively", () => {
    expect(parseCsvRecords("Kind,ID,Verdict\nnoun,kot,ok\nnoun,pies")).toEqual([
      { kind: "noun", id: "kot", verdict: "ok" },
      { kind: "noun", id: "pies", verdict: "" },
    ]);
  });

  it("refuses an unclosed quote", () => {
    expect(() => parseCsv('a,"b\n')).toThrow(/never closed/);
  });
});

describe("data file layout", () => {
  const files = readdirSync(DATA).filter((f) => f.endsWith(".json"));

  it("formats every file in data/ back to the same bytes", () => {
    expect(files.length).toBeGreaterThanOrEqual(9);
    for (const file of files) expect(formatJson(JSON.parse(read(file))), file).toBe(read(file));
  });

  it("knows the line each entry starts on", () => {
    const nouns = read("nouns.json").split("\n");
    for (const [i, line] of entryLines(JSON.parse(read("nouns.json")))) {
      expect(nouns[line - 1], `entry ${i}`).toBe("  {");
      expect(nouns[line]).toMatch(/^ {4}"lemma": /);
    }
    const collocations = read("collocations.json").split("\n");
    expect(collocations[(entryLines(JSON.parse(read("collocations.json"))).get("kot") ?? 0) - 1]).toMatch(/^ {2}"kot": \[/);
  });
});

/** A data file as it would read with every draft approved, which is what filesWithDrafts starts from. */
function unmarked(file: string): string {
  const content = JSON.parse(read(file)) as Record<string, Obj>;
  for (const entry of Object.values(content)) delete entry.review;
  return formatJson(content);
}

/**
 * Real files with a few entries marked as drafts, in memory only. Drafts
 * already in data/ are unmarked first, so the expectations below hold
 * whatever content is waiting for review.
 */
function filesWithDrafts(): DataFiles {
  const files = readAll();
  for (const content of Object.values(files)) {
    for (const entry of Object.values(content as Record<string, Obj>)) delete entry.review;
  }
  const mark = (file: string, pick: (e: Obj) => boolean) => {
    const list = files[file] as Obj[];
    list.find(pick)!.review = "draft";
  };
  mark("nouns.json", (n) => n.lemma === "kot");
  mark("adjectives.json", (a) => a.lemma === "ładny");
  mark("verbs.json", (v) => (v.impf as Obj).inf === "pisać");
  mark("templates.json", (t) => t.case === "acc" && t.pl === "Widzę {NP}.");
  (files["numeral-frames.json"] as Record<string, Obj>).voc.review = "draft";
  return files;
}

const row = (kind: string, id: string, verdict: string, correction = ""): ReviewRow => ({ kind, id, verdict, correction });

describe("review import", () => {
  it("names drafts the way the sheet does", () => {
    const ids = drafts(filesWithDrafts()).map((d) => `${d.kind} ${d.id}`);
    expect(ids).toEqual([
      "noun kot",
      "adjective ładny",
      "verb pisać / napisać",
      "template acc/any: Widzę {NP}.",
      "numeral-frame voc",
    ]);
    expect(entryId("verb", { impf: { inf: "uczyć się" }, pf: { inf: "nauczyć się" }, reflexive: true })).toBe(
      "uczyć się / nauczyć się",
    );
    expect(entryId("verb", { impf: { inf: "chodzić" } })).toBe("chodzić");
  });

  it("publishes on ok, deletes on reject, reports a fix and leaves it a draft", () => {
    const input = filesWithDrafts();
    const snapshot = structuredClone(input);
    const result = applyVerdicts(input, [
      row("noun", "kot", "ok"),
      row("adjective", "ładny", "reject"),
      row("verb", "pisać / napisać", "fix", 'add the object "wiadomość"'),
      row("template", "acc/any: Widzę {NP}.", " OK "),
      row("numeral-frame", "voc", ""),
    ]);

    expect(result.errors).toEqual([]);
    expect(input).toEqual(snapshot); // the input is never touched
    expect(result.changed.sort()).toEqual(["adjectives.json", "collocations.json", "nouns.json", "templates.json"]);

    const kot = (result.files["nouns.json"] as Obj[]).find((n) => n.lemma === "kot")!;
    expect(kot).not.toHaveProperty("review");
    expect((result.files["adjectives.json"] as Obj[]).some((a) => a.lemma === "ładny")).toBe(false);
    const collocations = result.files["collocations.json"] as Record<string, string[]>;
    expect(Object.values(collocations).flat()).not.toContain("ładny");
    expect(collocations.dziewczyna).toEqual(["piękny", "wysoki", "miły", "nowy"]);

    const pisac = (result.files["verbs.json"] as Obj[]).find((v) => (v.impf as Obj).inf === "pisać")!;
    expect(pisac.review).toBe("draft");
    const line = entryLines(result.files["verbs.json"]).get((result.files["verbs.json"] as Obj[]).indexOf(pisac));
    expect(result.fixes).toEqual([`data/verbs.json:${line} verb "pisać / napisać": add the object "wiadomość"`]);
    expect((result.files["numeral-frames.json"] as Record<string, Obj>).voc.review).toBe("draft");
  });

  it("writes an approved entry back exactly as it was before it was a draft", () => {
    const result = applyVerdicts(filesWithDrafts(), [row("noun", "kot", "ok"), row("template", "acc/any: Widzę {NP}.", "ok")]);
    expect(formatJson(result.files["nouns.json"])).toBe(unmarked("nouns.json"));
    expect(formatJson(result.files["templates.json"])).toBe(unmarked("templates.json"));
  });

  it("changes nothing the second time round", () => {
    const sheet = [
      row("noun", "kot", "ok"),
      row("adjective", "ładny", "reject"),
      row("verb", "pisać / napisać", "fix", "check the imperative"),
    ];
    const first = applyVerdicts(filesWithDrafts(), sheet);
    const second = applyVerdicts(first.files, sheet);
    expect(second.changed).toEqual([]);
    expect(second.errors).toEqual([]);
    expect(second.files).toEqual(first.files);
    expect(second.fixes).toEqual(first.fixes);
  });

  it("never deletes a published entry, and reports what it cannot apply", () => {
    const result = applyVerdicts(filesWithDrafts(), [
      row("noun", "pies", "reject"),
      row("noun", "kot", "maybe"),
      row("word", "kot", "ok"),
      row("noun", "nie-ma-takiego", "ok"),
    ]);
    expect(result.changed).toEqual([]);
    expect(result.errors).toEqual([
      'row 2: noun "pies" is published, not a draft; not removed',
      'row 3: verdict "maybe" is not one of ok, fix, reject',
      'row 4: unknown kind "word"',
    ]);
    expect(result.log).toEqual(['row 5: noun "nie-ma-takiego" not found']);
  });

  it("reports frames still naming a rejected word", () => {
    const files = filesWithDrafts();
    (files["nouns.json"] as Obj[]).find((n) => n.lemma === "pies")!.review = "draft";
    const result = applyVerdicts(files, [row("noun", "pies", "reject")]);
    expect(result.files["collocations.json"]).not.toHaveProperty("pies");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every((e) => /still names rejected noun "pies"/.test(e))).toBe(true);
  });
});

describe("review export", () => {
  const rows = reviewRows(filesWithDrafts());

  it("has a header and one row per draft, verdict and correction empty", () => {
    expect(rows[0]).toEqual([...COLUMNS]);
    expect(rows.slice(1).map((r) => r.slice(0, 2))).toEqual([
      ["noun", "kot"],
      ["adjective", "ładny"],
      ["verb", "pisać / napisać"],
      ["template", "acc/any: Widzę {NP}."],
      ["numeral-frame", "voc"],
    ]);
    for (const r of rows) expect(r).toHaveLength(COLUMNS.length);
    for (const r of rows.slice(1)) expect(r.slice(-2)).toEqual(["", ""]);
  });

  it("writes every form out", () => {
    const [, kot, ladny, pisac] = rows;
    expect(kot.slice(2, 6)).toEqual(["data/nouns.json", "A1", "2", "cat / cats"]);
    expect(kot[6]).toContain("sg: nom=kot gen=kota dat=kotu acc=kota ins=kotem loc=kocie voc=kocie");
    expect(kot[6]).toContain("pl: nom=koty gen=kotów");
    expect(ladny[6]).toContain("pl men: nom=ładni");
    expect(ladny[6]).toContain("acc=ładnego (inanimate: ładny)");
    expect(pisac[6]).toContain("impf pisać: pres piszę, piszesz, piszą");
    expect(describeForms(drafts(filesWithDrafts())[3])).toContain("excludeLemmas: [@relatives, kuchnia");
  });

  it("gives three sentences the generator built with the entry, answer filled in", () => {
    const [, kot, ladny, pisac, widze, voc] = rows;
    for (const r of [kot, ladny, pisac, widze]) {
      const examples = r.slice(7, 10);
      expect(new Set(examples).size, r[1]).toBe(3);
      for (const ex of examples) expect(ex, r[1]).toMatch(/^\S.* — \S/);
    }
    for (const ex of kot.slice(7, 10)) expect(ex).toMatch(/\bko(t|ta|tu|tem|cie|ty|tów|tom|tami|tach)\b/);
    for (const ex of ladny.slice(7, 10)) expect(ex).toMatch(/ładn/);
    for (const ex of widze.slice(7, 10)) expect(ex).toMatch(/^Widzę /);
    // present, past, future first
    expect(pisac[7]).toMatch(/piszę|piszesz|pisze|piszemy|piszecie|piszą/);
    expect(pisac[9]).toMatch(/napisz/);
    // voc is in the file but the numeral drill never asks for it
    expect(voc[7]).toBe("(no sentence uses it yet)");
  });
});
