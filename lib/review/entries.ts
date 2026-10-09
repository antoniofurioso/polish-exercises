import { entryLines } from "./format";

/**
 * The review flow's view of data/: which files hold reviewable entries, how a
 * draft is named in the sheet, and how a filled-in sheet is applied back to
 * the raw JSON (npm run review:import). Everything here works on the parsed
 * files as plain objects, so writing them back changes only what a verdict
 * asked for.
 */

export const KINDS = [
  "noun",
  "adjective",
  "verb",
  "template",
  "agreement-frame",
  "count-frame",
  "numeral-frame",
] as const;
export type Kind = (typeof KINDS)[number];

/** Where each kind lives in data/. numeral-frames.json is keyed by case; the rest are lists. */
export const KIND_FILES: Record<Kind, string> = {
  noun: "nouns.json",
  adjective: "adjectives.json",
  verb: "verbs.json",
  template: "templates.json",
  "agreement-frame": "agreement-frames.json",
  "count-frame": "count-frames.json",
  "numeral-frame": "numeral-frames.json",
};

/** Files a verdict can change: the entries' own, plus collocations for a rejected word. */
export const REVIEW_FILES = [...Object.values(KIND_FILES), "collocations.json", "groups.json"];

export type Obj = Record<string, unknown>;
/** Parsed data files by name, e.g. { "nouns.json": [...] }. */
export type DataFiles = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * How an entry is named in the sheet, unique within its kind: the lemma for a
 * word, "pisać / napisać" for a verb pair, "acc/any: Widzę {NP}." for a
 * sentence, the case for a numeral frame (`key`).
 */
export function entryId(kind: Kind, entry: Obj, key?: string): string {
  switch (kind) {
    case "noun":
    case "adjective":
      return str(entry.lemma);
    case "verb": {
      // reflexive infinitives already carry "się" in the data
      const inf = (aspect: unknown) => str((aspect as Obj | undefined)?.inf);
      return `${inf(entry.impf)} / ${inf(entry.pf)}`;
    }
    case "template":
    case "agreement-frame":
      return `${str(entry.case)}/${str(entry.number)}: ${str(entry.pl)}`;
    case "count-frame":
      return str(entry.pl);
    case "numeral-frame":
      return key ?? "";
  }
}

/** A reviewable entry found in the files: where it is and what it holds. */
export type Located = { kind: Kind; file: string; key: number | string; entry: Obj; id: string };

/** Every entry of `kind` in the files, in file order. */
export function entriesOf(files: DataFiles, kind: Kind): Located[] {
  const file = KIND_FILES[kind];
  const data = files[file];
  if (data === undefined) return [];
  const items: [number | string, unknown][] = Array.isArray(data)
    ? data.map((v, i) => [i, v])
    : Object.entries(data as Obj);
  return items.map(([key, entry]) => ({
    kind,
    file,
    key,
    entry: entry as Obj,
    id: entryId(kind, entry as Obj, typeof key === "string" ? key : undefined),
  }));
}

export const isDraftEntry = (entry: Obj) => entry.review === "draft";

/** Every draft in the files, kind by kind in KINDS order, each in file order. */
export function drafts(files: DataFiles): Located[] {
  return KINDS.flatMap((kind) => entriesOf(files, kind).filter((e) => isDraftEntry(e.entry)));
}

/** "data/nouns.json:123", the line the entry starts on once the file is written. */
export function location(files: DataFiles, file: string, key: number | string): string {
  const line = entryLines(files[file]).get(key);
  return `data/${file}${line ? `:${line}` : ""}`;
}

// ------------------------------------------------------------------ import

export const VERDICTS = ["ok", "fix", "reject"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** One filled-in row of the review sheet. */
export type ReviewRow = { kind: string; id: string; verdict: string; correction: string };

export type ImportResult = {
  /** The files after the verdicts, the same objects where nothing changed. */
  files: DataFiles;
  /** Names of the files that changed and need writing. */
  changed: string[];
  /** What happened, one line per row worth mentioning. */
  log: string[];
  /** The `fix` rows: the correction with where the entry is, for a human or an agent. */
  fixes: string[];
  /** Rows that could not be applied: unknown kind or verdict, an entry named twice. */
  errors: string[];
};

/** The lists a frame names words in, and which kind of word each holds. */
const WORD_LISTS: [string, "noun" | "adjective"][] = [
  ["lemmas", "noun"],
  ["excludeLemmas", "noun"],
  ["adjOnly", "adjective"],
];

/**
 * Applies the verdicts to a copy of the files:
 *
 *   ok      drops the entry's "review" field: it goes live;
 *   reject  deletes the entry (only ever a draft), and for a word its
 *           collocations; any other place still naming it is reported;
 *   fix     leaves the draft as it is and reports the correction.
 *
 * A row with no verdict is skipped. Applying the same sheet again changes
 * nothing: an approved entry is no longer a draft, a rejected one is gone.
 */
export function applyVerdicts(input: DataFiles, rows: ReviewRow[]): ImportResult {
  const files: DataFiles = { ...input };
  const changed = new Set<string>();
  const log: string[] = [];
  const errors: string[] = [];
  const pendingFixes: { kind: Kind; id: string; correction: string }[] = [];
  const rejectedWords: { kind: "noun" | "adjective"; lemma: string }[] = [];

  /** Copy-on-write: the first change to a file clones it. */
  const edit = <T>(file: string): T => {
    if (!changed.has(file)) {
      files[file] = structuredClone(files[file]);
      changed.add(file);
    }
    return files[file] as T;
  };

  rows.forEach((row, i) => {
    const verdict = row.verdict.trim().toLowerCase();
    if (verdict === "") return;
    const where = `row ${i + 2}`;
    const kind = row.kind.trim() as Kind;
    const id = row.id.trim();
    if (!KINDS.includes(kind)) return void errors.push(`${where}: unknown kind "${row.kind}"`);
    if (!(VERDICTS as readonly string[]).includes(verdict)) {
      return void errors.push(`${where}: verdict "${row.verdict}" is not one of ${VERDICTS.join(", ")}`);
    }

    const matches = entriesOf(files, kind).filter((e) => e.id === id);
    if (matches.length > 1) {
      return void errors.push(`${where}: ${matches.length} ${kind} entries are named "${id}"; resolve it by hand`);
    }
    const found = matches[0];

    if (verdict === "fix") {
      if (!found) return void log.push(`${where}: ${kind} "${id}" not found; fix skipped`);
      if (!row.correction.trim()) log.push(`${where}: ${kind} "${id}" marked fix with no correction`);
      pendingFixes.push({ kind, id, correction: row.correction.trim() });
      return;
    }
    if (!found) {
      log.push(`${where}: ${kind} "${id}" not found${verdict === "reject" ? " (already removed)" : ""}`);
      return;
    }
    if (!isDraftEntry(found.entry)) {
      if (verdict === "reject") errors.push(`${where}: ${kind} "${id}" is published, not a draft; not removed`);
      return; // ok on a published entry: already done
    }

    const data = edit<Obj[] | Obj>(found.file);
    if (verdict === "ok") {
      const entry = (data as Record<string | number, Obj>)[found.key];
      delete entry.review;
      log.push(`${where}: ${kind} "${id}" approved`);
    } else {
      if (Array.isArray(data)) data.splice(found.key as number, 1);
      else delete data[found.key as string];
      log.push(`${where}: ${kind} "${id}" rejected and removed`);
      if (kind === "noun" || kind === "adjective") rejectedWords.push({ kind, lemma: id });
    }
  });

  // a rejected word takes its collocations with it, and nothing else may name it
  for (const { kind, lemma } of rejectedWords) {
    const collocations = files["collocations.json"] as Record<string, string[]> | undefined;
    if (collocations) {
      if (kind === "noun" && lemma in collocations) {
        delete edit<Record<string, string[]>>("collocations.json")[lemma];
        log.push(`  collocations.json: removed "${lemma}"`);
      }
      if (kind === "adjective" && Object.values(collocations).some((list) => list.includes(lemma))) {
        const edited = edit<Record<string, string[]>>("collocations.json");
        for (const noun of Object.keys(edited)) edited[noun] = edited[noun].filter((a) => a !== lemma);
        log.push(`  collocations.json: removed "${lemma}" from every list`);
      }
    }
    for (const frameKind of ["template", "agreement-frame", "count-frame", "numeral-frame"] as const) {
      for (const e of entriesOf(files, frameKind)) {
        for (const [list, wordKind] of WORD_LISTS) {
          if (wordKind === kind && (e.entry[list] as string[] | undefined)?.includes(lemma)) {
            errors.push(`${location(files, e.file, e.key)} ${frameKind} "${e.id}" still names rejected ${kind} "${lemma}" in "${list}"`);
          }
        }
      }
    }
    const groups = files["groups.json"] as Record<string, string[]> | undefined;
    for (const [name, list] of Object.entries(groups ?? {})) {
      if (list.includes(lemma)) errors.push(`data/groups.json: "@${name}" still names rejected ${kind} "${lemma}"`);
    }
  }

  // line numbers as the files will be written
  const fixes = pendingFixes.map(({ kind, id, correction }) => {
    const found = entriesOf(files, kind).find((e) => e.id === id);
    const at = found ? location(files, found.file, found.key) : `data/${KIND_FILES[kind]}`;
    return `${at} ${kind} "${id}": ${correction || "(no correction given)"}`;
  });

  return { files, changed: [...changed], log, fixes, errors };
}
