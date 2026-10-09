/** Paths, the manifest format and command-line flags shared by the audio scripts. */
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ManifestEntry } from "./key";

export const ROOT = join(__dirname, "..", "..");
export const AUDIO_DIR = join(ROOT, "audio");
export const MANIFEST = join(AUDIO_DIR, "manifest.jsonl");
/** Rendered clips: `audio/out/<voice>/<hash>.mp3` (git-ignored). */
export const OUT_DIR = join(AUDIO_DIR, "out");
/** R2 keys already uploaded, one per line (git-ignored). */
export const UPLOADED = join(AUDIO_DIR, "uploaded.txt");

/** One JSON object per line, sorted by key so a content batch diffs cleanly. */
export function formatManifest(entries: ManifestEntry[]): string {
  const sorted = [...entries].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return sorted.map((e) => JSON.stringify({ key: e.key, voice: e.voice, text: e.text })).join("\n") + "\n";
}

export function parseManifest(source: string): ManifestEntry[] {
  return source
    .split("\n")
    .filter((line) => line.trim())
    .map((line, i) => {
      const entry = JSON.parse(line) as ManifestEntry;
      if (typeof entry.key !== "string" || typeof entry.text !== "string" || typeof entry.voice !== "string") {
        throw new Error(`manifest line ${i + 1}: expected {key, voice, text}`);
      }
      return entry;
    });
}

export function readManifest(path = MANIFEST): ManifestEntry[] {
  if (!existsSync(path)) throw new Error(`${path} not found: run npm run audio:manifest first`);
  return parseManifest(readFileSync(path, "utf8"));
}

/** Written next to the target and renamed, so an interrupted run never leaves half a clip. */
export function writeAtomic(path: string, data: Uint8Array | string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

/** Every `<voice>/<hash>.mp3` under the output folder, as R2 keys (`audio/<voice>/<hash>.mp3`). */
export function listClips(outDir = OUT_DIR): { key: string; path: string }[] {
  if (!existsSync(outDir)) return [];
  const out: { key: string; path: string }[] = [];
  for (const voice of readdirSync(outDir, { withFileTypes: true })) {
    if (!voice.isDirectory()) continue;
    for (const file of readdirSync(join(outDir, voice.name))) {
      if (/^[0-9a-f]{64}\.mp3$/.test(file)) {
        out.push({ key: `audio/${voice.name}/${file}`, path: join(outDir, voice.name, file) });
      }
    }
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : 1));
}

export type Flags = { [name: string]: string | true };

/** `--name value`, `--name=value` and bare `--name` (true). */
export function parseFlags(argv: string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`unexpected argument "${arg}"`);
    const eq = arg.indexOf("=");
    if (eq > 0) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      flags[arg.slice(2)] = argv[++i];
    } else {
      flags[arg.slice(2)] = true;
    }
  }
  return flags;
}

export function stringFlag(flags: Flags, name: string): string | undefined {
  const value = flags[name];
  if (value === true) throw new Error(`--${name} needs a value`);
  return value;
}

export function intFlag(flags: Flags, name: string, fallback: number): number {
  const value = stringFlag(flags, name);
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a positive integer`);
  return n;
}

/** An HTTP failure worth retrying: rate limited or a server error. */
export class RetryableError extends Error {
  constructor(
    message: string,
    /** Seconds the server asked us to wait (Retry-After), if it said. */
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export const isRetryableStatus = (status: number) => status === 429 || status >= 500;

/** Retry-After in seconds (a number or an HTTP date), when present. */
export function retryAfter(res: Response): number | undefined {
  const value = res.headers.get("Retry-After");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, (date - Date.now()) / 1000);
}

export type RetryOptions = {
  retries: number;
  /** First backoff in ms; doubled each attempt (plus up to 25% jitter), capped at 60 s. */
  baseDelay: number;
  sleep?: (ms: number) => Promise<void>;
};

export const DEFAULT_RETRY: RetryOptions = { retries: 6, baseDelay: 1000 };

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `attempt`, retrying a RetryableError or a network failure (TypeError
 * from fetch) with exponential backoff. Anything else fails at once.
 */
export async function withRetry<T>(attempt: () => Promise<T>, options: RetryOptions = DEFAULT_RETRY): Promise<T> {
  const sleep = options.sleep ?? realSleep;
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (error) {
      const retryable = error instanceof RetryableError || error instanceof TypeError;
      if (!retryable || i >= options.retries) throw error;
      const backoff = Math.min(60_000, options.baseDelay * 2 ** i) * (1 + Math.random() * 0.25);
      const asked = error instanceof RetryableError && error.retryAfter !== undefined ? error.retryAfter * 1000 : 0;
      await sleep(Math.max(backoff, asked));
    }
  }
}

/** Runs `worker` over `items`, at most `concurrency` at a time. */
export async function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  });
  await Promise.all(lanes);
}
