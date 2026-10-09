/**
 * npm run audio:render -- --engine <azure|piper|cmd> [--voice <voice>]
 *                         [--concurrency N] [--limit N] [--cmd "<template>"] [--cmd-ext wav]
 *
 * Renders every sentence in audio/manifest.jsonl that has no clip yet in
 * audio/out/<voice>/<hash>.mp3. Safe to stop and re-run at any time.
 *
 *   azure  AZURE_TTS_KEY, AZURE_TTS_REGION; --voice is an Azure voice
 *          (default NEXT_PUBLIC_TTS_VOICE, else pl-PL-ZofiaNeural)
 *   piper  PIPER_BIN (default piper), PIPER_MODEL (required), PIPER_ARGS, FFMPEG_BIN
 *   cmd    --cmd "tool --in {text_file} --out {out}", FFMPEG_BIN
 *
 * For piper and cmd, --voice is a label of your choosing (e.g. piper-pl-gosia):
 * the app asks for it with NEXT_PUBLIC_TTS_VOICE and the Worker serves it once
 * it is listed in EXTRA_VOICES. See README.md, "Audio".
 */
import { cpus } from "node:os";
import { relative, resolve } from "node:path";
import { type Engine, FatalError, azureEngine, cmdEngine, piperEngine } from "./engines";
import { MANIFEST, OUT_DIR, intFlag, parseFlags, readManifest, stringFlag } from "./files";
import { appVoice, checkVoice, isVoice } from "./key";
import { missingClips, renderJobs } from "./pipeline";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new FatalError(`${name} is not set`);
  return value;
}

function makeEngine(name: string, flags: ReturnType<typeof parseFlags>): Engine {
  const ffmpeg = process.env.FFMPEG_BIN || "ffmpeg";
  if (name === "azure") return azureEngine({ key: env("AZURE_TTS_KEY"), region: env("AZURE_TTS_REGION") });
  if (name === "piper") {
    return piperEngine({
      bin: process.env.PIPER_BIN || "piper",
      model: env("PIPER_MODEL"),
      args: (process.env.PIPER_ARGS ?? "").split(/\s+/).filter(Boolean),
      ffmpeg,
    });
  }
  if (name === "cmd") {
    const template = stringFlag(flags, "cmd");
    if (!template) throw new FatalError('--engine cmd needs --cmd "<template with {text_file} and {out}>"');
    return cmdEngine({ template, ext: stringFlag(flags, "cmd-ext"), ffmpeg });
  }
  throw new FatalError(`--engine must be azure, piper or cmd (got "${name}")`);
}

function pickVoice(engine: string, flag: string | undefined): string {
  if (engine === "azure") {
    const voice = flag ?? appVoice(process.env);
    if (!isVoice(voice)) throw new FatalError(`${voice} is not an Azure voice`);
    return voice;
  }
  const voice = flag ?? process.env.NEXT_PUBLIC_TTS_VOICE;
  if (!voice) throw new FatalError(`--engine ${engine} needs --voice <label>, e.g. --voice piper-pl-gosia`);
  // a Piper clip filed under an Azure voice name would be served as that voice
  if (isVoice(voice)) throw new FatalError(`${voice} is an Azure voice name; pick your own label for ${engine}`);
  return checkVoice(voice);
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const engineName = stringFlag(flags, "engine");
  if (!engineName) throw new FatalError("usage: npm run audio:render -- --engine <azure|piper|cmd> [--voice …]");
  const voice = pickVoice(engineName, stringFlag(flags, "voice"));
  const engine = makeEngine(engineName, flags);
  const concurrency = intFlag(flags, "concurrency", engineName === "azure" ? 8 : Math.max(1, cpus().length - 1));
  const manifest = resolve(stringFlag(flags, "manifest") ?? MANIFEST);
  const outDir = resolve(stringFlag(flags, "out") ?? OUT_DIR);

  const entries = readManifest(manifest);
  const missing = await missingClips(entries, voice, outDir);
  const jobs = missing.slice(0, intFlag(flags, "limit", missing.length || 1));
  const chars = jobs.reduce((n, j) => n + [...j.text].length, 0);
  console.log(
    `${voice}: ${entries.length - missing.length} of ${entries.length} clips already in ` +
      `${relative(process.cwd(), outDir)}/${voice}; rendering ${jobs.length} (${chars} characters) ` +
      `with ${engine.name}, ${concurrency} at a time`,
  );
  if (jobs.length === 0) return;

  const started = Date.now();
  let last = 0;
  const result = await renderJobs(jobs, voice, engine, {
    concurrency,
    progress: (done, total, failed) => {
      const now = Date.now();
      if (done < total && now - last < 2000) return;
      last = now;
      const rate = done / Math.max(1, (now - started) / 1000);
      const eta = Math.round((total - done) / Math.max(rate, 0.001));
      console.log(
        `  ${done}/${total} (${((100 * done) / total).toFixed(1)}%), ${failed} failed, ` +
          `${rate.toFixed(1)}/s${done < total ? `, ~${eta}s left` : ""}`,
      );
    },
  });

  console.log(`Rendered ${result.rendered} clips in ${((Date.now() - started) / 1000).toFixed(0)}s.`);
  for (const { text, error } of result.failed.slice(0, 20)) console.error(`  failed: ${JSON.stringify(text)}: ${error}`);
  if (result.failed.length > 20) console.error(`  … and ${result.failed.length - 20} more`);
  if (result.aborted) throw new FatalError(`stopped: ${result.aborted}`);
  if (result.failed.length) {
    console.error(`${result.failed.length} failed; re-run to retry them.`);
    process.exit(1);
  }
  console.log("Next: npm run audio:upload");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
