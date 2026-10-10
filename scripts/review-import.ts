/**
 * npm run review:import review/pending.csv
 *
 * Applies a filled-in review sheet to data/: `ok` publishes the draft,
 * `reject` deletes it, `fix` prints the correction for a human or an agent to
 * make. Running it twice on the same sheet changes nothing the second time.
 * Exits 1 when a row could not be applied. See data/README.md.
 */
import { readFileSync } from "node:fs";
import { REVIEW_FILES, applyVerdicts } from "../lib/review/entries";
import { parseCsvRecords } from "../lib/review/csv";
import { readDataFiles, writeDataFile } from "./data-files";

function main() {
  const path = process.argv[2];
  if (!path) throw new Error("usage: npm run review:import <sheet.csv>");
  const records = parseCsvRecords(readFileSync(path, "utf8"));
  for (const column of ["kind", "id", "verdict"]) {
    if (records.length > 0 && !(column in records[0])) throw new Error(`${path}: no "${column}" column`);
  }
  const rows = records.map((r) => ({
    kind: r.kind ?? "",
    id: r.id ?? "",
    verdict: r.verdict ?? "",
    correction: r.correction ?? "",
  }));

  const result = applyVerdicts(readDataFiles(REVIEW_FILES), rows);
  for (const file of result.changed) writeDataFile(file, result.files[file]);

  for (const line of result.log) console.log(line);
  if (result.fixes.length) {
    console.log(`\nTo fix (still drafts):`);
    for (const line of result.fixes) console.log(`  ${line}`);
  }
  if (result.errors.length) {
    console.error(`\nNot applied:`);
    for (const line of result.errors) console.error(`  ${line}`);
  }
  const written = result.changed.length ? result.changed.map((f) => `data/${f}`).join(", ") : "nothing";
  console.log(`\nWrote ${written}.`);
  if (result.changed.length) console.log("Run npm test; if the golden snapshot moved, review the diff and update it on purpose.");
  if (result.errors.length) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
