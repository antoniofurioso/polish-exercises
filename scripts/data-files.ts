import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatJson } from "../lib/review/format";
import type { DataFiles } from "../lib/review/entries";

/** Reading and writing data/*.json for the review scripts. */

export const ROOT = join(__dirname, "..");
export const DATA_DIR = join(ROOT, "data");

export function readDataFiles(names: string[]): DataFiles {
  return Object.fromEntries(names.map((name) => [name, JSON.parse(readFileSync(join(DATA_DIR, name), "utf8"))]));
}

/** Writes a data file in the layout the files are kept in (lib/review/format.ts). */
export function writeDataFile(name: string, value: unknown): void {
  writeFileSync(join(DATA_DIR, name), formatJson(value));
}
