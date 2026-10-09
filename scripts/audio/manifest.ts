/**
 * npm run audio:manifest [-- --voice <voice>] [--spell-max 9999] [--out <file>]
 *
 * Writes every sentence the app can speak (published content only) to
 * audio/manifest.jsonl: one {key, voice, text} per line, sorted by key, where
 * key = sha256(voice + "\n" + normalised text), exactly as the TTS Worker
 * computes it. `npm run audio:render` then renders whatever is missing.
 * See README.md, "Audio".
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { DRILL_KINDS, SPELL_RANGES } from "../../lib/types";
import type { SpellRange } from "../../lib/types";
import { MANIFEST, formatManifest, parseFlags, stringFlag } from "./files";
import { type ManifestEntry, appVoice, checkVoice, manifestEntry } from "./key";

async function main() {
  // published content only: what a learner hears. lib/lexicon.ts reads this on load.
  process.env.NEXT_PUBLIC_INCLUDE_DRAFTS = "";
  const { DEFAULT_SAMPLING, sampleDrill } = await import("./sample");

  const flags = parseFlags(process.argv.slice(2));
  const voice = checkVoice(stringFlag(flags, "voice") ?? appVoice(process.env));
  const out = resolve(stringFlag(flags, "out") ?? MANIFEST);
  const spellFlag = stringFlag(flags, "spell-max");
  const spellMax = (spellFlag ? Number(spellFlag) : DEFAULT_SAMPLING.spellMax) as SpellRange;
  if (!(SPELL_RANGES as readonly number[]).includes(spellMax)) {
    throw new Error(`--spell-max must be one of ${SPELL_RANGES.join(", ")}`);
  }

  const started = Date.now();
  const all = new Set<string>();
  const rows: string[][] = [];
  for (const kind of DRILL_KINDS) {
    const t = Date.now();
    const sample = sampleDrill(kind, { ...DEFAULT_SAMPLING, spellMax });
    let chars = 0;
    for (const text of sample.strings) {
      all.add(text);
      chars += [...text].length;
    }
    rows.push([
      kind,
      String(sample.strings.size),
      String(chars),
      String(sample.sessions),
      `${((Date.now() - t) / 1000).toFixed(1)}s`,
      sample.unsaturated.length ? `not saturated: ${sample.unsaturated.join(", ")}` : "",
    ]);
  }

  const entries: ManifestEntry[] = [];
  const refused: string[] = [];
  const keys = new Set<string>();
  for (const text of all) {
    const entry = await manifestEntry(voice, text);
    if (!entry) refused.push(text);
    // two spellings that normalise to the same text share one clip
    else if (!keys.has(entry.key)) {
      keys.add(entry.key);
      entries.push(entry);
    }
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, formatManifest(entries));

  const total = entries.reduce((n, e) => n + [...e.text].length, 0);
  console.log(`drill        strings  characters  sessions  time`);
  for (const [kind, n, chars, sessions, time, note] of rows) {
    console.log(
      `${kind.padEnd(12)} ${n.padStart(7)}  ${chars.padStart(10)}  ${sessions.padStart(8)}  ${time.padStart(5)}  ${note}`.trimEnd(),
    );
  }
  console.log(
    `\n${relative(process.cwd(), out)}: ${entries.length} clips for ${voice}, ${total} characters, ` +
      `${(statSync(out).size / 1e6).toFixed(1)} MB, spelling drill up to ${spellMax}, ` +
      `${((Date.now() - started) / 1000).toFixed(0)}s`,
  );
  if (refused.length) {
    console.log(`\n${refused.length} sentences the Worker would refuse (left out; the browser voice reads them):`);
    for (const text of refused.slice(0, 20)) console.log(`  ${JSON.stringify(text)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
