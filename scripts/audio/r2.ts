/** Uploading rendered clips to the Worker's R2 bucket over its S3-compatible API. */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { AwsClient } from "aws4fetch";
import { DEFAULT_RETRY, RetryableError, type RetryOptions, isRetryableStatus, pool, retryAfter, withRetry } from "./files";
import { AUDIO_CACHE_CONTROL } from "./key";

export type R2Options = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  fetch?: typeof fetch;
  retry?: RetryOptions;
};

export interface Bucket {
  /** True when the object is already there. */
  exists(key: string): Promise<boolean>;
  put(key: string, body: Uint8Array): Promise<void>;
}

/** An R2 bucket through https://<account>.r2.cloudflarestorage.com, signed with SigV4 (aws4fetch). */
export function r2Bucket({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucket,
  fetch: fetchImpl = fetch,
  retry = DEFAULT_RETRY,
}: R2Options): Bucket {
  const aws = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  const url = (key: string) =>
    `https://${accountId}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}/${key
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;

  async function send(key: string, init: RequestInit): Promise<Response> {
    return withRetry(async () => {
      const res = await fetchImpl(await aws.sign(url(key), init));
      if (isRetryableStatus(res.status)) throw new RetryableError(`R2 answered ${res.status}`, retryAfter(res));
      return res;
    }, retry);
  }

  return {
    async exists(key) {
      const res = await send(key, { method: "HEAD" });
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`HEAD ${key}: R2 answered ${res.status}`);
      return true;
    },
    async put(key, body) {
      const res = await send(key, {
        method: "PUT",
        body: body as Uint8Array<ArrayBuffer>,
        headers: {
          "Content-Type": "audio/mpeg",
          // what the Worker sets when it stores a clip itself
          "Cache-Control": AUDIO_CACHE_CONTROL,
        },
      });
      if (!res.ok) throw new Error(`PUT ${key}: R2 answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  };
}

/** The keys in audio/uploaded.txt. */
export function readIndex(path: string): Set<string> {
  if (!existsSync(path)) return new Set();
  return new Set(readFileSync(path, "utf8").split("\n").filter(Boolean));
}

export type UploadResult = { uploaded: number; present: number; skipped: number; failed: { key: string; error: string }[] };

/**
 * Uploads every clip whose key is not in the local index. Each one is checked
 * with HEAD first (it may be there from another machine or from the Worker
 * itself) and recorded in the index once it is in the bucket, so a re-run
 * only touches what is new.
 */
export async function uploadClips(
  clips: { key: string; path: string }[],
  bucket: Bucket,
  {
    index,
    indexPath,
    concurrency,
    progress,
  }: {
    index: Set<string>;
    indexPath: string;
    concurrency: number;
    progress?: (done: number, total: number) => void;
  },
): Promise<UploadResult> {
  const todo = clips.filter((c) => !index.has(c.key));
  const result: UploadResult = { uploaded: 0, present: 0, skipped: clips.length - todo.length, failed: [] };
  let done = 0;
  await pool(todo, concurrency, async ({ key, path }) => {
    try {
      if (await bucket.exists(key)) {
        result.present++;
      } else {
        await bucket.put(key, new Uint8Array(await readFile(path)));
        result.uploaded++;
      }
      index.add(key);
      appendFileSync(indexPath, `${key}\n`);
    } catch (error) {
      result.failed.push({ key, error: error instanceof Error ? error.message : String(error) });
    }
    progress?.(++done, todo.length);
  });
  return result;
}
