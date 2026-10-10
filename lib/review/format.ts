/**
 * Writes data/*.json in the layout the files are kept in, so a script that
 * edits them (npm run review:import) leaves a diff a human can read:
 *
 *   - two-space indent, one entry per object, a newline at the end;
 *   - the file itself and each of its entries are always spread over lines;
 *   - inside an entry, a list of plain values sits on one line
 *     (`"sg": ["kot", "kota", ...]`), and so does an object holding only plain
 *     values and such lists (`"past": { "m": "pisał", ... }`);
 *   - anything holding objects is spread out again (`"impf"`, `"objects"`).
 *
 * formatJson(JSON.parse(file)) gives the file back byte for byte; the tests
 * hold every file in data/ to that.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const isPlain = (v: unknown): boolean => v === null || typeof v !== "object";
const isPlainList = (v: unknown): boolean => Array.isArray(v) && v.every(isPlain);

function render(value: unknown, depth: number, indent: string): string {
  if (isPlain(value)) return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.every(isPlain)) return `[${value.map((v) => JSON.stringify(v)).join(", ")}]`;
    return `[\n${value.map((v) => inner + render(v, depth + 1, inner)).join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, Json>);
  if (entries.length === 0) return "{}";
  const pair = ([key, v]: [string, unknown], pad: string) => `${pad}${JSON.stringify(key)}: ${render(v, depth + 1, inner)}`;
  if (depth >= 2 && entries.every(([, v]) => isPlain(v) || isPlainList(v))) {
    return `{ ${entries.map((e) => pair(e, "")).join(", ")} }`;
  }
  return `{\n${entries.map((e) => pair(e, inner)).join(",\n")}\n${indent}}`;
}

/** The text of a data file holding `value`. */
export function formatJson(value: unknown): string {
  return `${render(value, 0, "")}\n`;
}

/**
 * The 1-based line each top-level entry starts on in formatJson(value): by
 * index for a list, by key for an object (collocations, numeral frames).
 */
export function entryLines(value: unknown): Map<string | number, number> {
  const lines = new Map<string | number, number>();
  let line = 2;
  const items: [string | number, unknown][] = Array.isArray(value)
    ? value.map((v, i) => [i, v])
    : Object.entries(value as Record<string, unknown>);
  for (const [key, v] of items) {
    lines.set(key, line);
    line += render(v, 1, "  ").split("\n").length;
  }
  return lines;
}
