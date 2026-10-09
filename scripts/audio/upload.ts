/**
 * npm run audio:upload [-- --concurrency N] [--recheck]
 *
 * Uploads every clip in audio/out/ that is not in the R2 bucket yet, as
 * audio/<voice>/<hash>.mp3 (the key the Worker reads), with
 * Content-Type audio/mpeg and the Worker's Cache-Control.
 *
 * Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET
 * (an R2 API token with Object Read & Write on that bucket). Uploaded keys are
 * listed in audio/uploaded.txt so a re-run skips them; --recheck ignores that
 * list and asks the bucket again. See README.md, "Audio".
 */
import { rmSync } from "node:fs";
import { relative } from "node:path";
import { OUT_DIR, UPLOADED, intFlag, listClips, parseFlags } from "./files";
import { r2Bucket, readIndex, uploadClips } from "./r2";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const bucket = r2Bucket({
    accountId: env("R2_ACCOUNT_ID"),
    accessKeyId: env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    bucket: env("R2_BUCKET"),
  });
  if (flags.recheck) rmSync(UPLOADED, { force: true });

  const clips = listClips(OUT_DIR);
  const index = readIndex(UPLOADED);
  console.log(
    `${clips.length} clips in ${relative(process.cwd(), OUT_DIR)}, ` +
      `${clips.filter((c) => index.has(c.key)).length} already uploaded`,
  );
  const started = Date.now();
  let last = 0;
  const result = await uploadClips(clips, bucket, {
    index,
    indexPath: UPLOADED,
    concurrency: intFlag(flags, "concurrency", 16),
    progress: (done, total) => {
      const now = Date.now();
      if (done < total && now - last < 2000) return;
      last = now;
      console.log(`  ${done}/${total}`);
    },
  });
  console.log(
    `Uploaded ${result.uploaded}, already in the bucket ${result.present}, skipped ${result.skipped} ` +
      `(${((Date.now() - started) / 1000).toFixed(0)}s).`,
  );
  for (const { key, error } of result.failed.slice(0, 20)) console.error(`  failed: ${key}: ${error}`);
  if (result.failed.length) {
    console.error(`${result.failed.length} failed; re-run to retry them.`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
