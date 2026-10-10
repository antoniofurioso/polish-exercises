import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Env, handle } from "../src/index";
import { audioKey, escapeXml, normaliseText, ssml, textProblem } from "../src/text";

const ORIGIN = "https://polish.example";
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3, 4, 5, 6, 7]);

/** In-memory R2: only what the Worker uses. */
function mockR2() {
  const objects = new Map<string, ArrayBuffer>();
  const bucket = {
    objects,
    get: vi.fn(async (key: string) => {
      const body = objects.get(key);
      return body ? { arrayBuffer: async () => body.slice(0) } : null;
    }),
    put: vi.fn(async (key: string, value: ArrayBuffer) => {
      objects.set(key, value);
      return {};
    }),
  };
  return bucket;
}

/** In-memory caches.default. */
function mockCache() {
  const entries = new Map<string, Response>();
  return {
    entries,
    match: vi.fn(async (req: Request) => entries.get(req.url)?.clone()),
    put: vi.fn(async (req: Request, res: Response) => {
      entries.set(req.url, res);
    }),
  };
}

let r2: ReturnType<typeof mockR2>;
let cache: ReturnType<typeof mockCache>;
let azure: ReturnType<typeof vi.fn>;
let limit: ReturnType<typeof vi.fn>;
let pending: Promise<unknown>[];

function env(over: Partial<Env> = {}): Env {
  return {
    AUDIO: r2 as unknown as R2Bucket,
    AZURE_TTS_KEY: "test-key",
    AZURE_TTS_REGION: "westeurope",
    ALLOWED_ORIGINS: `${ORIGIN}, http://localhost:3000`,
    MISS_LIMITER: { limit } as unknown as RateLimit,
    ...over,
  };
}

const ctx = () =>
  ({ waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} }) as unknown as ExecutionContext;

async function get(
  query: Record<string, string>,
  headers: Record<string, string> = { Origin: ORIGIN },
  method = "GET",
  over: Partial<Env> = {},
): Promise<Response> {
  const url = `https://tts.example/tts?${new URLSearchParams(query)}`;
  const res = await handle(new Request(url, { method, headers }), env(over), ctx());
  await Promise.all(pending);
  return res;
}

beforeEach(() => {
  r2 = mockR2();
  cache = mockCache();
  pending = [];
  azure = vi.fn(async () => new Response(MP3.slice(0), { status: 200 }));
  limit = vi.fn(async () => ({ success: true }));
  vi.stubGlobal("fetch", azure);
  vi.stubGlobal("caches", { default: cache });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("text rules", () => {
  it("normalises spacing and Unicode before hashing", async () => {
    expect(normaliseText("  Nie  mam\n kota. ")).toBe("Nie mam kota.");
    // decomposed ó (o + combining acute) becomes the single code point
    expect(normaliseText("Kót")).toBe("Kót");
    expect(await audioKey("pl-PL-ZofiaNeural", "a")).toMatch(
      /^audio\/pl-PL-ZofiaNeural\/[0-9a-f]{64}\.mp3$/,
    );
  });

  it("accepts Polish sentences with basic punctuation", () => {
    expect(textProblem("Zażółć gęślą jaźń — „tak”, (2) …?! 'ok' \"ok\" a-b – c; d:")).toBeNull();
  });

  it("refuses empty, too long and foreign-script text", () => {
    expect(textProblem("")).toMatch(/empty/);
    expect(textProblem("a".repeat(301))).toMatch(/longer/);
    expect(textProblem("ą".repeat(300))).toBeNull();
    expect(textProblem("<speak>")).toMatch(/not allowed/);
    expect(textProblem("Привет")).toMatch(/not allowed/);
    expect(textProblem("kot 🐈")).toMatch(/not allowed/);
    expect(textProblem("a & b")).toMatch(/not allowed/);
  });

  it("escapes XML in the SSML", () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;",
    );
    const doc = ssml(`Rock 'n' "roll"`, "pl-PL-MarekNeural");
    expect(doc).toContain('xml:lang="pl-PL"');
    expect(doc).toContain('<voice name="pl-PL-MarekNeural">');
    expect(doc).toContain("Rock &apos;n&apos; &quot;roll&quot;");
  });
});

describe("validation", () => {
  it.each([
    [{}, /empty/],
    [{ text: "   " }, /empty/],
    [{ text: "x".repeat(301) }, /longer/],
    [{ text: "<b>kot</b>" }, /not allowed/],
    [{ text: "kot", voice: "en-US-JennyNeural" }, /voice/],
  ])("rejects %o with 400 and never calls Azure", async (query, message) => {
    const res = await get(query as Record<string, string>);
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(message);
    expect(azure).not.toHaveBeenCalled();
    expect(r2.get).not.toHaveBeenCalled();
  });

  it("404s other paths and 405s other methods", async () => {
    const other = await handle(
      new Request("https://tts.example/", { headers: { Origin: ORIGIN } }),
      env(),
      ctx(),
    );
    expect(other.status).toBe(404);
    expect((await get({ text: "kot" }, { Origin: ORIGIN }, "POST")).status).toBe(405);
  });
});

describe("origin and CORS", () => {
  it("refuses a missing or unknown Origin with 403", async () => {
    expect((await get({ text: "Kot." }, {})).status).toBe(403);
    expect((await get({ text: "Kot." }, { Origin: "https://evil.example" })).status).toBe(403);
    expect(azure).not.toHaveBeenCalled();
  });

  it("answers the preflight for an allowed origin", async () => {
    const res = await get({}, { Origin: "http://localhost:3000" }, "OPTIONS");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  it("refuses the preflight for an unknown origin", async () => {
    expect((await get({}, { Origin: "https://evil.example" }, "OPTIONS")).status).toBe(403);
  });

  it("echoes the allowed origin on audio", async () => {
    const res = await get({ text: "Kot." });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Vary")).toBe("Origin");
  });
});

describe("cache miss", () => {
  it("calls Azure once, stores in R2 and the edge cache, and returns mp3", async () => {
    const res = await get({ text: "  Nie mam   kota. " });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(MP3);

    expect(azure).toHaveBeenCalledTimes(1);
    const [url, init] = azure.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1");
    const headers = init.headers as Record<string, string>;
    expect(headers["Ocp-Apim-Subscription-Key"]).toBe("test-key");
    expect(headers["X-Microsoft-OutputFormat"]).toBe("audio-24khz-48kbitrate-mono-mp3");
    expect(init.body).toContain('<voice name="pl-PL-ZofiaNeural">');
    expect(init.body).toContain(">Nie mam kota.<");

    const key = await audioKey("pl-PL-ZofiaNeural", "Nie mam kota.");
    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(r2.objects.has(key)).toBe(true);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it("uses the requested voice in the key and the SSML", async () => {
    await get({ text: "Kot.", voice: "pl-PL-AgnieszkaNeural" });
    const key = await audioKey("pl-PL-AgnieszkaNeural", "Kot.");
    expect(r2.objects.has(key)).toBe(true);
    expect((azure.mock.calls[0] as [string, RequestInit])[1].body).toContain("AgnieszkaNeural");
  });

  it("returns 502 and stores nothing when Azure fails", async () => {
    azure.mockResolvedValueOnce(new Response("nope", { status: 401 }));
    const res = await get({ text: "Kot." });
    expect(res.status).toBe(502);
    expect(r2.put).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("returns 502 when the network to Azure fails", async () => {
    azure.mockRejectedValueOnce(new TypeError("network"));
    expect((await get({ text: "Kot." })).status).toBe(502);
  });

  it("serves byte ranges", async () => {
    const res = await get({ text: "Kot." }, { Origin: ORIGIN, Range: "bytes=0-3" });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 0-3/${MP3.length}`);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(MP3.slice(0, 4));
  });
});

describe("cache hit", () => {
  it("streams from R2 without calling Azure or the rate limiter", async () => {
    const key = await audioKey("pl-PL-ZofiaNeural", "Mam kota.");
    r2.objects.set(key, MP3.slice(0).buffer);
    const res = await get({ text: "Mam kota." });
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(MP3);
    expect(azure).not.toHaveBeenCalled();
    expect(limit).not.toHaveBeenCalled();
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it("serves from the edge cache without touching R2", async () => {
    await get({ text: "Mam kota." });
    r2.get.mockClear();
    azure.mockClear();
    const res = await get({ text: "Mam  kota." });
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(MP3);
    expect(r2.get).not.toHaveBeenCalled();
    expect(azure).not.toHaveBeenCalled();
  });
});

describe("pre-rendered audio, Azure optional", () => {
  const NO_AZURE = { AZURE_TTS_KEY: undefined };

  it("answers a miss with 404 and CORS headers when no Azure key is set", async () => {
    const res = await get({ text: "Kot." }, { Origin: ORIGIN }, "GET", NO_AZURE);
    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(azure).not.toHaveBeenCalled();
    expect(limit).not.toHaveBeenCalled();
    expect(r2.put).not.toHaveBeenCalled();
  });

  it("treats a key without a region as no Azure", async () => {
    const res = await get({ text: "Kot." }, { Origin: ORIGIN }, "GET", { AZURE_TTS_REGION: "" });
    expect(res.status).toBe(404);
    expect(azure).not.toHaveBeenCalled();
  });

  it("still serves R2 hits without an Azure key", async () => {
    const key = await audioKey("pl-PL-ZofiaNeural", "Kot.");
    r2.objects.set(key, MP3.slice(0).buffer);
    const res = await get({ text: "Kot." }, { Origin: ORIGIN }, "GET", NO_AZURE);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(MP3);
  });

  it("serves a voice listed in EXTRA_VOICES from R2 and never synthesises it", async () => {
    const extra = { EXTRA_VOICES: " piper-pl-gosia, bad/label ,local-pl" };
    const key = await audioKey("piper-pl-gosia", "Mam kota.");
    expect(key).toMatch(/^audio\/piper-pl-gosia\/[0-9a-f]{64}\.mp3$/);
    r2.objects.set(key, MP3.slice(0).buffer);

    const hit = await get({ text: "Mam kota.", voice: "piper-pl-gosia" }, { Origin: ORIGIN }, "GET", extra);
    expect(hit.status).toBe(200);
    expect(new Uint8Array(await hit.arrayBuffer())).toEqual(MP3);

    // Azure is configured, but this is not an Azure voice: a miss is a 404
    const miss = await get({ text: "Pies.", voice: "local-pl" }, { Origin: ORIGIN }, "GET", extra);
    expect(miss.status).toBe(404);
    expect(miss.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(azure).not.toHaveBeenCalled();

    const unlisted = await get({ text: "Kot.", voice: "bad/label" }, { Origin: ORIGIN }, "GET", extra);
    expect(unlisted.status).toBe(400);
    const off = await get({ text: "Kot.", voice: "piper-pl-gosia" });
    expect(off.status).toBe(400);
  });
});

describe("rate limit", () => {
  it("limits misses per client IP", async () => {
    limit.mockResolvedValueOnce({ success: false });
    const res = await get({ text: "Kot." }, { Origin: ORIGIN, "CF-Connecting-IP": "203.0.113.7" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(limit).toHaveBeenCalledWith({ key: "203.0.113.7" });
    expect(azure).not.toHaveBeenCalled();
  });

  it("never limits hits", async () => {
    limit.mockResolvedValue({ success: false });
    const key = await audioKey("pl-PL-ZofiaNeural", "Kot.");
    r2.objects.set(key, MP3.slice(0).buffer);
    expect((await get({ text: "Kot." })).status).toBe(200);
    expect(limit).not.toHaveBeenCalled();
  });
});
