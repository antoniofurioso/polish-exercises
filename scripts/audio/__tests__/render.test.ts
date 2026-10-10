import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FatalError, azureEngine, cmdEngine, fillTemplate, isMp3, piperEngine, shellQuote } from "../engines";
import { withRetry } from "../files";
import { audioHash, localClip } from "../key";
import { missingClips, renderJobs } from "../pipeline";

const MP3 = [0x49, 0x44, 0x33, 4, 0, 0];
const noSleep = { retries: 3, baseDelay: 1, sleep: async () => {} };

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "audio-test-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A fake program: a Node script that logs its argv and stdin to `<name>.log`, then runs `body`. */
function fakeBin(name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(
    path,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const stdin = fs.readFileSync(0, "utf8");
fs.appendFileSync(${JSON.stringify(join(dir, `${name}.log`))}, JSON.stringify({ args, stdin }) + "\\n");
${body}
`,
  );
  chmodSync(path, 0o755);
  return path;
}

const calls = (name: string) =>
  readFileSync(join(dir, `${name}.log`), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { args: string[]; stdin: string });

/** Writes MP3 bytes to its last argument, like `ffmpeg … out.mp3`. */
const fakeFfmpeg = () =>
  fakeBin("ffmpeg", `fs.writeFileSync(args[args.length - 1], Buffer.from(${JSON.stringify(MP3)}));`);

describe("azure engine", () => {
  it("posts the Worker's SSML and returns the audio", async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array(MP3), { status: 200 }));
    const engine = azureEngine({ key: "k", region: "westeurope", fetch, retry: noSleep });
    const audio = await engine.render("Mam „kota” …", "pl-PL-MarekNeural");
    expect([...audio]).toEqual(MP3);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1");
    const headers = init.headers as Record<string, string>;
    expect(headers["Ocp-Apim-Subscription-Key"]).toBe("k");
    expect(headers["X-Microsoft-OutputFormat"]).toBe("audio-24khz-48kbitrate-mono-mp3");
    expect(init.body).toContain('<voice name="pl-PL-MarekNeural"><prosody rate="-10%">Mam „kota” …</prosody>');
  });

  it("retries 429 and 5xx with backoff, honouring Retry-After", async () => {
    const sleeps: number[] = [];
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(new Uint8Array(MP3), { status: 200 }));
    const engine = azureEngine({
      key: "k",
      region: "r",
      fetch,
      retry: { retries: 3, baseDelay: 10, sleep: async (ms) => void sleeps.push(ms) },
    });
    expect([...(await engine.render("Kot.", "pl-PL-ZofiaNeural"))]).toEqual(MP3);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleeps[0]).toBeGreaterThanOrEqual(2000);
    expect(sleeps[1]).toBeGreaterThanOrEqual(20);
  });

  it("gives up after the retries, and stops at once on a bad key or a non-Azure voice", async () => {
    const busy = vi.fn(async () => new Response("", { status: 500 }));
    await expect(azureEngine({ key: "k", region: "r", fetch: busy, retry: noSleep }).render("Kot.", "pl-PL-ZofiaNeural")).rejects.toThrow(/500/);
    expect(busy).toHaveBeenCalledTimes(4);

    const denied = vi.fn(async () => new Response("", { status: 401 }));
    const engine = azureEngine({ key: "k", region: "r", fetch: denied, retry: noSleep });
    await expect(engine.render("Kot.", "pl-PL-ZofiaNeural")).rejects.toBeInstanceOf(FatalError);
    expect(denied).toHaveBeenCalledTimes(1);
    await expect(engine.render("Kot.", "piper-pl-x")).rejects.toBeInstanceOf(FatalError);
  });
});

describe("piper engine", () => {
  it("feeds the sentence on stdin and converts the WAV with ffmpeg", async () => {
    const piper = fakeBin("piper", `
const out = args[args.indexOf("--output_file") + 1];
fs.writeFileSync(out, Buffer.from("RIFF....WAVEfmt "));`);
    const ffmpeg = fakeFfmpeg();
    const engine = piperEngine({ bin: piper, model: "/models/pl.onnx", args: ["--length_scale", "1.1"], ffmpeg });
    expect([...(await engine.render("Zażółć gęślą jaźń.", "piper-pl"))]).toEqual(MP3);

    const [call] = calls("piper");
    expect(call.stdin).toBe("Zażółć gęślą jaźń.\n");
    expect(call.args.slice(0, 4)).toEqual(["--model", "/models/pl.onnx", "--length_scale", "1.1"]);
    const [conv] = calls("ffmpeg");
    expect(conv.args).toEqual(expect.arrayContaining(["-ac", "1", "-ar", "24000", "-b:a", "48k"]));
    expect(conv.args[conv.args.indexOf("-i") + 1]).toMatch(/clip\.wav$/);
  });

  it("reports a missing binary as fatal and a failing one as an error", async () => {
    const engine = piperEngine({ bin: join(dir, "nope"), model: "m", ffmpeg: "ffmpeg" });
    await expect(engine.render("Kot.", "v")).rejects.toBeInstanceOf(FatalError);
    const broken = fakeBin("piper", `process.stderr.write("bad model"); process.exit(2);`);
    await expect(piperEngine({ bin: broken, model: "m", ffmpeg: "ffmpeg" }).render("Kot.", "v")).rejects.toThrow(
      /exited with 2: bad model/,
    );
  });
});

describe("cmd engine", () => {
  it("never puts the sentence in the shell command", async () => {
    const tool = fakeBin("tts", `fs.writeFileSync(args[1], Buffer.from([0xff, 0xfb, 1, 2]));`);
    const ffmpeg = fakeFfmpeg();
    const evil = `Kot'; touch ${join(dir, "pwned")}; echo "$(touch ${join(dir, "pwned2")})`;
    const engine = cmdEngine({ template: `${tool} {text_file} {out}`, ext: "mp3", ffmpeg });
    expect([...(await engine.render(evil, "local-pl"))]).toEqual([0xff, 0xfb, 1, 2]);
    expect(existsSync(join(dir, "pwned"))).toBe(false);
    expect(existsSync(join(dir, "pwned2"))).toBe(false);
    const [call] = calls("tts");
    expect(call.args[0]).toMatch(/text\.txt$/);
    expect(call.args[1]).toMatch(/out\.mp3$/);
    expect(call.stdin).toBe(`${evil}\n`);
    // already MP3: ffmpeg is not needed
    expect(existsSync(join(dir, "ffmpeg.log"))).toBe(false);
  });

  it("reads the text file and converts a WAV through ffmpeg", async () => {
    const tool = fakeBin(
      "tts",
      `const text = fs.readFileSync(args[0], "utf8");
fs.writeFileSync(${JSON.stringify(join(dir, "seen.txt"))}, text);
fs.writeFileSync(args[1], Buffer.from("RIFF....WAVE"));`,
    );
    const ffmpeg = fakeFfmpeg();
    const engine = cmdEngine({ template: `${tool} {text_file} {out}`, ffmpeg });
    expect([...(await engine.render("Widzę „kota” …", "local-pl"))]).toEqual(MP3);
    expect(readFileSync(join(dir, "seen.txt"), "utf8")).toBe("Widzę „kota” …\n");
    expect(calls("ffmpeg")[0].args[calls("ffmpeg")[0].args.indexOf("-i") + 1]).toMatch(/out\.wav$/);
  });

  it("checks the template and quotes paths for the shell", () => {
    expect(() => cmdEngine({ template: "tts {text_file}", ffmpeg: "ffmpeg" })).toThrow(/\{out\}/);
    expect(shellQuote("/tmp/it's here")).toBe(`'/tmp/it'\\''s here'`);
    expect(fillTemplate("t -i {text_file} -o {out} {out}", "/a b", "/c")).toBe("t -i '/a b' -o '/c' '/c'");
    expect(isMp3(new Uint8Array([0x49, 0x44, 0x33]))).toBe(true);
    expect(isMp3(new Uint8Array([0xff, 0xf3]))).toBe(true);
    expect(isMp3(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false);
  });
});

describe("rendering the manifest", () => {
  const entries = [
    { key: "x", voice: "pl-PL-ZofiaNeural", text: "Kot." },
    { key: "y", voice: "pl-PL-ZofiaNeural", text: "Pies." },
    { key: "z", voice: "pl-PL-ZofiaNeural", text: "Ryba." },
  ];

  it("renders only the missing clips, under the voice's own keys, and resumes", async () => {
    const out = join(dir, "out");
    const render = vi.fn(async (text: string) => new TextEncoder().encode(`mp3:${text}`));
    const engine = { name: "fake", render };

    const jobs = await missingClips(entries, "piper-pl", out);
    expect(jobs.map((j) => j.key)).toEqual([
      await audioHash("piper-pl", "Kot."),
      await audioHash("piper-pl", "Pies."),
      await audioHash("piper-pl", "Ryba."),
    ]);
    const first = await renderJobs(jobs.slice(0, 2), "piper-pl", engine, { concurrency: 2 });
    expect(first).toEqual({ rendered: 2, failed: [] });
    const path = localClip(out, "piper-pl", await audioHash("piper-pl", "Kot."));
    expect(readFileSync(path, "utf8")).toBe("mp3:Kot.");

    const rest = await missingClips(entries, "piper-pl", out);
    expect(rest.map((j) => j.text)).toEqual(["Ryba."]);
    await renderJobs(rest, "piper-pl", engine, { concurrency: 2 });
    expect(await missingClips(entries, "piper-pl", out)).toEqual([]);
    expect(render).toHaveBeenCalledTimes(3);
  });

  it("records failures, carries on, and stops on a fatal error", async () => {
    const out = join(dir, "out");
    const flaky = {
      name: "flaky",
      render: async (text: string) => {
        if (text === "Pies.") throw new Error("boom");
        return new Uint8Array(MP3);
      },
    };
    const jobs = await missingClips(entries, "v", out);
    const progress = vi.fn();
    const result = await renderJobs(jobs, "v", flaky, { concurrency: 1, progress });
    expect(result.rendered).toBe(2);
    expect(result.failed).toEqual([{ text: "Pies.", error: "boom" }]);
    expect(progress).toHaveBeenLastCalledWith(3, 3, 1);

    const fatal = {
      name: "fatal",
      render: vi.fn(async () => {
        throw new FatalError("no key");
      }),
    };
    const stopped = await renderJobs(await missingClips(entries, "w", out), "w", fatal, { concurrency: 1 });
    expect(stopped.aborted).toBe("no key");
    expect(fatal.render).toHaveBeenCalledTimes(1);
  });

  it("retries network errors but not other failures", async () => {
    const network = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce("ok");
    expect(await withRetry(network, noSleep)).toBe("ok");
    const other = vi.fn().mockRejectedValue(new Error("nope"));
    await expect(withRetry(other, noSleep)).rejects.toThrow("nope");
    expect(other).toHaveBeenCalledTimes(1);
  });
});
