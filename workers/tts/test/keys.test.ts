/**
 * The pre-render scripts (scripts/audio/) and the Worker must agree on every
 * key: a clip rendered from the manifest has to be found when the app asks
 * for the same sentence. This drives the real handler with the client's URL
 * (lib/ttsUrl.ts) and checks which R2 object it looks up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ttsSrc } from "../../../lib/ttsUrl";
import { audioPath, manifestEntry } from "../../../scripts/audio/key";
import { type Env, handle } from "../src/index";

const ORIGIN = "https://polish.example";

const SAMPLES = [
  "Nie mam kota.",
  "Zażółć gęślą jaźń.",
  "ŻÓŁW, ĆMA i ŹREBIĘ.",
  "On mówi: „Dzień dobry”.",
  "Nie mam … ",
  "… do pracy!",
  "  Dwie   kobiety\tidą. ",
  "Kot ma ogórek.", // decomposed ó
  "dwa tysiące dwieście dwadzieścia dwa",
];

let requested: string[];

beforeEach(() => {
  requested = [];
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {} } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function keyTheWorkerReads(url: string): Promise<string> {
  const env: Env = {
    AUDIO: {
      get: async (key: string) => {
        requested.push(key);
        return null;
      },
    } as unknown as R2Bucket,
    ALLOWED_ORIGINS: ORIGIN,
    EXTRA_VOICES: "piper-pl-test",
  };
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  const res = await handle(new Request(url, { headers: { Origin: ORIGIN } }), env, ctx);
  // no Azure key: a miss is a 404, after the R2 lookup we are checking
  expect(res.status).toBe(404);
  expect(requested).toHaveLength(1);
  return requested[0];
}

describe("app-side and Worker-side keys", () => {
  it.each(SAMPLES)("agree for %j", async (spoken) => {
    for (const voice of ["pl-PL-ZofiaNeural", "piper-pl-test"]) {
      requested = [];
      const entry = await manifestEntry(voice, spoken);
      expect(entry).not.toBeNull();
      const url = ttsSrc("https://tts.example", spoken, voice);
      expect(await keyTheWorkerReads(url)).toBe(audioPath(voice, entry!.key));
    }
  });

  it("agree for the default voice when the client sends none", async () => {
    const entry = await manifestEntry("pl-PL-ZofiaNeural", "Mam kota.");
    expect(await keyTheWorkerReads(ttsSrc("https://tts.example", "Mam kota."))).toBe(
      audioPath("pl-PL-ZofiaNeural", entry!.key),
    );
  });
});
