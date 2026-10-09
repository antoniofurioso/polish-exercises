/**
 * npm run review:export [out.csv]
 *
 * Writes every draft in data/ to review/pending.csv (or the path given) for a
 * native speaker to judge in Google Sheets or Excel: see data/README.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { ROOT, readDataFiles } from "./data-files";

async function main() {
  // the example sentences need the drafts in the lexicon the generator draws from
  process.env.NEXT_PUBLIC_INCLUDE_DRAFTS = "1";
  const { REVIEW_FILES, drafts } = await import("../lib/review/entries");
  const { reviewSheet } = await import("../lib/review/export");

  const out = resolve(process.argv[2] ?? join(ROOT, "review", "pending.csv"));
  const files = readDataFiles(REVIEW_FILES);
  const pending = drafts(files);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, reviewSheet(files));

  const counts = new Map<string, number>();
  for (const d of pending) counts.set(d.kind, (counts.get(d.kind) ?? 0) + 1);
  const summary = [...counts].map(([kind, n]) => `${n} ${kind}`).join(", ") || "no drafts";
  console.log(`${relative(process.cwd(), out)}: ${pending.length} rows (${summary})`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
