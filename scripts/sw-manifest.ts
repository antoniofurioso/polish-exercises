/**
 * Runs after `next build` (npm run build does both): stamps the service worker
 * in out/ with this build's precache list and version (plans/phase-3.md §2).
 *
 * - Lists every file in out/ the app needs offline: each exported page
 *   (*.html), its RSC payloads (*.txt), everything under /_next/static, the
 *   manifest and the icons. Not sw.js itself or sw-precache.json.
 * - version = hash of those files' contents plus the build time, so it changes
 *   with every build (and the browser sees a new sw.js on every deploy).
 * - Writes out/sw-precache.json ({version, files}) and replaces the
 *   `const BUILD = null;` line of out/sw.js (copied from public/sw.js) with it.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT = join(__dirname, "..", "out");
const PLACEHOLDER = "const BUILD = null; // replaced by scripts/sw-manifest.ts";
const SKIP = new Set(["/sw.js", "/sw-precache.json"]);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function main() {
  let sw: string;
  try {
    sw = readFileSync(join(OUT, "sw.js"), "utf8");
  } catch {
    throw new Error("out/sw.js not found: run `next build` first (npm run build does both)");
  }
  if (!sw.includes(PLACEHOLDER)) throw new Error(`out/sw.js: "${PLACEHOLDER}" not found (already stamped?)`);

  const files = walk(OUT)
    .map((path) => "/" + relative(OUT, path).split(sep).join("/"))
    .filter((url) => !SKIP.has(url) && !url.split("/").some((part) => part.startsWith(".")))
    .sort();

  const hash = createHash("sha256");
  for (const url of files) {
    hash.update(url + "\n");
    hash.update(readFileSync(join(OUT, url)));
  }
  hash.update(new Date().toISOString());
  const version = hash.digest("hex").slice(0, 16);

  const build = { version, files };
  writeFileSync(join(OUT, "sw-precache.json"), JSON.stringify(build, null, 2) + "\n");
  writeFileSync(join(OUT, "sw.js"), sw.replace(PLACEHOLDER, `const BUILD = ${JSON.stringify(build)};`));

  const pages = files.filter((f) => f.endsWith(".html")).length;
  console.log(`out/sw.js: version ${version}, ${files.length} files precached (${pages} pages)`);
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
