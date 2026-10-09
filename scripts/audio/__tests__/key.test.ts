import { describe, expect, it } from "vitest";
import { ttsSrc } from "../../../lib/ttsUrl";
import { spokenGap } from "../../../lib/speak";
import { audioKey, normaliseText } from "../../../workers/tts/src/text";
import { formatManifest, parseManifest } from "../files";
import { appVoice, audioPath, checkVoice, localClip, manifestEntry } from "../key";

const SAMPLES = [
  "Nie mam kota.",
  "Zażółć gęślą jaźń.",
  "ŻÓŁW I ĆMA ŹLE ŚPIĄ, ŃA? Ę Ą",
  "On mówi: „Dzień dobry”.",
  "Widzę … ryż!",
  spokenGap("Nie mam ___ ."),
  "  Dwie   kobiety\tidą . ",
  // decomposed ó (o + combining acute): normalised to NFC before hashing
  "Kot ma ogórek.",
];

/** What the Worker does with the client's URL before hashing (workers/tts/src/index.ts). */
function workerText(url: string): string {
  return normaliseText(new URL(url).searchParams.get("text") ?? "");
}

describe("app-side audio keys", () => {
  it.each(SAMPLES)("match the Worker's key for %j", async (spoken) => {
    for (const voice of ["pl-PL-ZofiaNeural", "piper-pl-test"]) {
      const entry = await manifestEntry(voice, spoken);
      expect(entry).not.toBeNull();
      const fromClient = workerText(ttsSrc("https://tts.example", spoken, voice));
      expect(entry!.text).toBe(fromClient);
      expect(audioPath(voice, entry!.key)).toBe(await audioKey(voice, fromClient));
    }
  });

  it("hashes voice + newline + text", async () => {
    const entry = await manifestEntry("pl-PL-ZofiaNeural", "a");
    const { createHash } = await import("node:crypto");
    expect(entry!.key).toBe(createHash("sha256").update("pl-PL-ZofiaNeural\na").digest("hex"));
  });

  it("leaves out what the Worker would refuse", async () => {
    expect(await manifestEntry("pl-PL-ZofiaNeural", "   ")).toBeNull();
    expect(await manifestEntry("pl-PL-ZofiaNeural", "kot 🐈")).toBeNull();
  });

  it("picks the app's voice and checks labels", () => {
    expect(appVoice({})).toBe("pl-PL-ZofiaNeural");
    expect(appVoice({ NEXT_PUBLIC_TTS_VOICE: "piper-pl-gosia" })).toBe("piper-pl-gosia");
    expect(checkVoice("piper-pl-gosia")).toBe("piper-pl-gosia");
    expect(() => checkVoice("../etc")).toThrow(/bad voice/);
    expect(() => checkVoice("a b")).toThrow(/bad voice/);
    expect(localClip("out", "v", "ab")).toBe("out/v/ab.mp3");
  });
});

describe("manifest format", () => {
  it("is one sorted JSON object per line and reads back", () => {
    const entries = [
      { key: "bb", voice: "v", text: "Dwa „koty”." },
      { key: "aa", voice: "v", text: "Kot…" },
    ];
    const text = formatManifest(entries);
    expect(text).toBe(
      '{"key":"aa","voice":"v","text":"Kot…"}\n{"key":"bb","voice":"v","text":"Dwa „koty”."}\n',
    );
    expect(parseManifest(text)).toEqual([entries[1], entries[0]]);
    expect(() => parseManifest('{"key":1}')).toThrow(/line 1/);
  });
});
