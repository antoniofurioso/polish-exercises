/** Rendering the manifest's missing clips: resumable, concurrent, with progress. */
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type Engine, FatalError } from "./engines";
import { pool, writeAtomic } from "./files";
import { type ManifestEntry, audioHash, localClip } from "./key";

export type RenderJob = { text: string; key: string; path: string };

/**
 * The manifest's sentences that have no clip on disk yet for `voice`. Keys
 * are recomputed for that voice, so one manifest serves every voice.
 */
export async function missingClips(entries: ManifestEntry[], voice: string, outDir: string): Promise<RenderJob[]> {
  const jobs: RenderJob[] = [];
  const seen = new Set<string>();
  for (const { text } of entries) {
    const key = await audioHash(voice, text);
    if (seen.has(key)) continue;
    seen.add(key);
    const path = localClip(outDir, voice, key);
    if (!existsSync(path)) jobs.push({ text, key, path });
  }
  return jobs;
}

export type RenderResult = { rendered: number; failed: { text: string; error: string }[]; aborted?: string };

/**
 * Renders each job into its path (written atomically, so an interrupted run
 * resumes cleanly). A FatalError (bad key, missing binary) stops the run;
 * any other failure is recorded and the rest carry on.
 */
export async function renderJobs(
  jobs: RenderJob[],
  voice: string,
  engine: Engine,
  { concurrency, progress }: { concurrency: number; progress?: (done: number, total: number, failed: number) => void },
): Promise<RenderResult> {
  const result: RenderResult = { rendered: 0, failed: [] };
  let done = 0;
  await pool(jobs, concurrency, async (job) => {
    if (result.aborted) return;
    try {
      const audio = await engine.render(job.text, voice);
      mkdirSync(dirname(job.path), { recursive: true });
      writeAtomic(job.path, audio);
      result.rendered++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof FatalError) result.aborted = message;
      else result.failed.push({ text: job.text, error: message });
    }
    done++;
    progress?.(done, jobs.length, result.failed.length);
  });
  return result;
}
