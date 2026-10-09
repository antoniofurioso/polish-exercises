import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listClips } from "../files";
import { r2Bucket, readIndex, uploadClips } from "../r2";

const HASH = "a".repeat(64);
const HASH2 = "b".repeat(64);
const noSleep = { retries: 2, baseDelay: 1, sleep: async () => {} };

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "audio-upload-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** An in-memory R2 behind a mocked fetch: HEAD and PUT, keyed by URL path. */
function fakeR2(failFirst = 0) {
  const objects = new Map<string, { body: Uint8Array; headers: Headers }>();
  let failures = failFirst;
  const fetch = vi.fn(async (request: Request) => {
    if (failures > 0) {
      failures--;
      return new Response("busy", { status: 503 });
    }
    const path = new URL(request.url).pathname;
    if (request.method === "HEAD") return new Response(null, { status: objects.has(path) ? 200 : 404 });
    if (request.method === "PUT") {
      objects.set(path, { body: new Uint8Array(await request.arrayBuffer()), headers: request.headers });
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 405 });
  });
  const bucket = r2Bucket({
    accountId: "acct",
    accessKeyId: "AKID",
    secretAccessKey: "secret",
    bucket: "polish-exercises-tts",
    fetch: fetch as unknown as typeof globalThis.fetch,
    retry: noSleep,
  });
  return { objects, fetch, bucket };
}

function clip(voice: string, hash: string, body: string) {
  mkdirSync(join(dir, "out", voice), { recursive: true });
  writeFileSync(join(dir, "out", voice, `${hash}.mp3`), body);
}

describe("upload", () => {
  it("lists clips as R2 keys", () => {
    clip("pl-PL-ZofiaNeural", HASH, "one");
    clip("piper-pl", HASH2, "two");
    writeFileSync(join(dir, "out", "piper-pl", "notes.txt"), "ignored");
    expect(listClips(join(dir, "out")).map((c) => c.key)).toEqual([
      `audio/pl-PL-ZofiaNeural/${HASH}.mp3`,
      `audio/piper-pl/${HASH2}.mp3`,
    ].sort());
  });

  it("puts new clips with the Worker's headers, signed, and records them", async () => {
    clip("pl-PL-ZofiaNeural", HASH, "one");
    const { objects, fetch, bucket } = fakeR2();
    const indexPath = join(dir, "uploaded.txt");
    const result = await uploadClips(listClips(join(dir, "out")), bucket, {
      index: readIndex(indexPath),
      indexPath,
      concurrency: 4,
    });
    expect(result).toMatchObject({ uploaded: 1, present: 0, skipped: 0, failed: [] });

    const put = fetch.mock.calls.map(([r]) => r as Request).find((r) => r.method === "PUT")!;
    expect(put.url).toBe(`https://acct.r2.cloudflarestorage.com/polish-exercises-tts/audio/pl-PL-ZofiaNeural/${HASH}.mp3`);
    expect(put.headers.get("Authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/auto\/s3\/aws4_request/);
    const stored = objects.get(`/polish-exercises-tts/audio/pl-PL-ZofiaNeural/${HASH}.mp3`)!;
    expect(new TextDecoder().decode(stored.body)).toBe("one");
    expect(stored.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(stored.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(readFileSync(indexPath, "utf8")).toBe(`audio/pl-PL-ZofiaNeural/${HASH}.mp3\n`);
  });

  it("skips indexed clips without asking, and does not re-put what the bucket has", async () => {
    clip("v", HASH, "one");
    clip("v", HASH2, "two");
    const { objects, fetch, bucket } = fakeR2();
    objects.set(`/polish-exercises-tts/audio/v/${HASH2}.mp3`, { body: new Uint8Array(), headers: new Headers() });
    const indexPath = join(dir, "uploaded.txt");
    writeFileSync(indexPath, `audio/v/${HASH}.mp3\n`);

    const result = await uploadClips(listClips(join(dir, "out")), bucket, {
      index: readIndex(indexPath),
      indexPath,
      concurrency: 2,
    });
    expect(result).toMatchObject({ uploaded: 0, present: 1, skipped: 1, failed: [] });
    expect(fetch.mock.calls.map(([r]) => (r as Request).method)).toEqual(["HEAD"]);
    expect(readIndex(indexPath)).toEqual(new Set([`audio/v/${HASH}.mp3`, `audio/v/${HASH2}.mp3`]));
  });

  it("retries a busy bucket and reports what still failed", async () => {
    clip("v", HASH, "one");
    const indexPath = join(dir, "uploaded.txt");
    const retried = fakeR2(2);
    const ok = await uploadClips(listClips(join(dir, "out")), retried.bucket, { index: new Set(), indexPath, concurrency: 1 });
    expect(ok.uploaded).toBe(1);

    const down = fakeR2(100);
    const failed = await uploadClips(listClips(join(dir, "out")), down.bucket, {
      index: new Set(),
      indexPath: join(dir, "other.txt"),
      concurrency: 1,
    });
    expect(failed.failed).toHaveLength(1);
    expect(failed.failed[0].error).toMatch(/503/);
  });
});
