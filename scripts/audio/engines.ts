/**
 * The text-to-speech engines `npm run audio:render` can use. Each one turns a
 * normalised sentence into MP3 bytes in the Worker's format (24 kHz mono,
 * 48 kbit/s): Azure returns it directly, the local engines go through ffmpeg.
 *
 *   azure  Azure Neural TTS over REST, with the Worker's own SSML
 *   piper  a local Piper binary and a voice model (.onnx)
 *   cmd    any command-line tool, through a template with {text_file} and {out}
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_RETRY, RetryableError, type RetryOptions, isRetryableStatus, retryAfter, withRetry } from "./files";
import { AZURE_OUTPUT_FORMAT, MP3_BITRATE, MP3_SAMPLE_RATE, azureEndpoint, isVoice, ssml } from "./key";

export interface Engine {
  name: string;
  /** MP3 bytes for one normalised sentence. Throws on failure. */
  render(text: string, voice: string): Promise<Uint8Array>;
}

/** A failure that will not get better by trying the next sentence (bad key, missing binary). */
export class FatalError extends Error {}

// ------------------------------------------------------------------ azure

export type AzureOptions = {
  key: string;
  region: string;
  fetch?: typeof fetch;
  retry?: RetryOptions;
};

export function azureEngine({ key, region, fetch: fetchImpl = fetch, retry = DEFAULT_RETRY }: AzureOptions): Engine {
  return {
    name: "azure",
    async render(text, voice) {
      if (!isVoice(voice)) throw new FatalError(`${voice} is not an Azure voice`);
      return withRetry(async () => {
        const res = await fetchImpl(azureEndpoint(region), {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": AZURE_OUTPUT_FORMAT,
            "User-Agent": "polish-exercises-audio-render",
          },
          body: ssml(text, voice),
        });
        if (isRetryableStatus(res.status)) {
          throw new RetryableError(`Azure answered ${res.status}`, retryAfter(res));
        }
        if (res.status === 401 || res.status === 403) {
          throw new FatalError(`Azure answered ${res.status}: check AZURE_TTS_KEY and AZURE_TTS_REGION`);
        }
        if (!res.ok) throw new Error(`Azure answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const audio = new Uint8Array(await res.arrayBuffer());
        if (audio.byteLength === 0) throw new RetryableError("Azure returned no audio");
        return audio;
      }, retry);
    },
  };
}

// ------------------------------------------------------- local processes

/** Runs a program (no shell unless `shell`), feeding `stdin`; rejects on a non-zero exit. */
export function run(
  command: string,
  args: string[],
  { stdin, shell = false }: { stdin?: string; shell?: boolean } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const stdio: ["pipe", "ignore", "pipe"] = ["pipe", "ignore", "pipe"];
    const child = shell ? spawn(command, { shell: true, stdio }) : spawn(command, args, { stdio });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(error.code === "ENOENT" ? new FatalError(`${command}: not found`) : error);
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${shell ? "command" : command} exited with ${code}: ${stderr.trim()}`));
    });
    child.stdin.on("error", () => {
      // a tool that never reads stdin closes it early; its exit code still decides
    });
    child.stdin.end(stdin ?? "");
  });
}

/** MP3 with an ID3 tag or starting on an MPEG audio frame. */
export function isMp3(bytes: Uint8Array): boolean {
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

/** Re-encodes any audio file ffmpeg can read to the Worker's MP3 format. */
export async function toMp3(ffmpeg: string, input: string, output: string): Promise<void> {
  await run(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-ac",
    "1",
    "-ar",
    String(MP3_SAMPLE_RATE),
    "-codec:a",
    "libmp3lame",
    "-b:a",
    MP3_BITRATE,
    output,
  ]);
}

/** A scratch folder per sentence, always cleaned up. */
async function inTempDir<T>(work: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "audio-render-"));
  try {
    return await work(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The clip at `path` as MP3: kept when it already is one, converted otherwise. */
async function asMp3(ffmpeg: string, path: string, dir: string): Promise<Uint8Array> {
  const bytes = new Uint8Array(await readFile(path).catch(() => {
    throw new Error(`no audio was written to ${path}`);
  }));
  if (bytes.byteLength === 0) throw new Error("the engine wrote an empty file");
  if (isMp3(bytes)) return bytes;
  const mp3 = join(dir, "clip.mp3");
  await toMp3(ffmpeg, path, mp3);
  return new Uint8Array(await readFile(mp3));
}

// ------------------------------------------------------------------ piper

export type PiperOptions = {
  /** The piper executable (PIPER_BIN, default "piper"). */
  bin: string;
  /** The voice model, e.g. pl_PL-gosia-medium.onnx (PIPER_MODEL); its .onnx.json sits next to it. */
  model: string;
  /** Extra arguments (PIPER_ARGS), e.g. "--length_scale 1.1" to read 10% slower, like the Worker. */
  args?: string[];
  ffmpeg: string;
};

/** Piper reads the sentence on stdin and writes a WAV, which ffmpeg turns into MP3. */
export function piperEngine({ bin, model, args = [], ffmpeg }: PiperOptions): Engine {
  return {
    name: "piper",
    render: (text) =>
      inTempDir(async (dir) => {
        const wav = join(dir, "clip.wav");
        await run(bin, ["--model", model, ...args, "--output_file", wav], { stdin: `${text}\n` });
        return asMp3(ffmpeg, wav, dir);
      }),
  };
}

// -------------------------------------------------------------------- cmd

/** A path quoted for a POSIX shell. */
export function shellQuote(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

/**
 * The shell command for one sentence. Only the two temporary file paths are
 * substituted; the sentence itself never goes into the command line, it is
 * read from {text_file} (and is also given on stdin).
 */
export function fillTemplate(template: string, textFile: string, out: string): string {
  return template.replaceAll("{text_file}", shellQuote(textFile)).replaceAll("{out}", shellQuote(out));
}

export type CmdOptions = {
  /** e.g. `my-tts --voice anna --in {text_file} --wav {out}` */
  template: string;
  /** The extension {out} gets, for tools that pick the format from it (default wav). */
  ext?: string;
  ffmpeg: string;
};

export function cmdEngine({ template, ext = "wav", ffmpeg }: CmdOptions): Engine {
  if (!template.includes("{out}")) throw new FatalError("--cmd needs an {out} placeholder");
  if (!/^[a-z0-9]{1,5}$/i.test(ext)) throw new FatalError(`bad --cmd-ext "${ext}"`);
  return {
    name: "cmd",
    render: (text) =>
      inTempDir(async (dir) => {
        const textFile = join(dir, "text.txt");
        const out = join(dir, `out.${ext}`);
        await writeFile(textFile, `${text}\n`, "utf8");
        await run(fillTemplate(template, textFile, out), [], { stdin: `${text}\n`, shell: true });
        return asMp3(ffmpeg, out, dir);
      }),
  };
}
