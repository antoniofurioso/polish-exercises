/**
 * Just enough CSV for the review sheet (RFC 4180): fields quoted when they
 * hold a comma, a quote or a line break, quotes doubled, records ended with
 * CRLF. The file starts with a UTF-8 byte-order mark so Excel reads the
 * Polish letters right; Google Sheets ignores it.
 */

const BOM = "﻿";

function field(value: string): string {
  return /[",\r\n]/.test(value) || value !== value.trim() ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][]): string {
  return BOM + rows.map((row) => row.map(field).join(",")).join("\r\n") + "\r\n";
}

/**
 * Reads CSV back as rows of fields. Accepts the BOM or none, CRLF or LF, and
 * a sheet saved with ";" or tab between fields (what Excel does in some
 * locales), told apart by the header line. Blank lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const header = src.slice(0, src.search(/\r?\n|$/));
  const sep = header.includes(",") ? "," : header.includes(";") ? ";" : header.includes("\t") ? "\t" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  const endRow = () => {
    row.push(cell);
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
    cell = "";
  };

  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        cell += ch;
      }
      i++;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && src[i + 1] === "\n") {
      endRow();
      i++;
    } else if (ch === "\n" || ch === "\r") endRow();
    else cell += ch;
    i++;
  }
  if (quoted) throw new Error("CSV: a quoted field is never closed");
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

/** Rows as objects keyed by the header line's column names. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const names = header.map((h) => h.trim().toLowerCase());
  return rows.map((row) => Object.fromEntries(names.map((name, i) => [name, row[i] ?? ""])));
}
