import {
  DEFAULT_VOICE,
  type Voice,
  audioKey,
  isVoice,
  normaliseText,
  ssml,
  textProblem,
} from "./text";

export interface Env {
  /** Generated audio, one object per (voice, sentence). */
  AUDIO: R2Bucket;
  /** Secret: `wrangler secret put AZURE_TTS_KEY`. */
  AZURE_TTS_KEY: string;
  AZURE_TTS_REGION: string;
  /** Comma-separated list of exact origins, e.g. "https://a.pages.dev,http://localhost:3000". */
  ALLOWED_ORIGINS: string;
  /** Workers Rate Limiting binding, keyed by client IP, applied to cache misses only. */
  MISS_LIMITER?: RateLimit;
}

const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const IMMUTABLE = "public, max-age=31536000, immutable";

/** The origin when it is on the allow-list; null otherwise (or when absent). */
function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
    Vary: "Origin",
  };
}

function plain(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(message, {
    status,
    headers: { ...headers, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/**
 * Media elements (Safari above all) ask for byte ranges, so serve them. The
 * clips are a few dozen kB, so slicing a buffer is cheaper than being clever.
 */
function audioResponse(
  audio: ArrayBuffer,
  range: string | null,
  headers: Record<string, string>,
): Response {
  const size = audio.byteLength;
  const base = {
    ...headers,
    "Content-Type": "audio/mpeg",
    "Cache-Control": IMMUTABLE,
    "Accept-Ranges": "bytes",
  };
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (!match || (match[1] === "" && match[2] === "")) {
    return new Response(audio, { status: 200, headers: base });
  }
  let start: number;
  let end: number;
  if (match[1] === "") {
    // suffix range: the last N bytes
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) {
    return new Response(null, {
      status: 416,
      headers: { ...base, "Content-Range": `bytes */${size}` },
    });
  }
  return new Response(audio.slice(start, end + 1), {
    status: 206,
    headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}` },
  });
}

/** One paid call to Azure Neural TTS. Null on any failure. */
async function synthesise(text: string, voice: Voice, env: Env): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(
      `https://${env.AZURE_TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": env.AZURE_TTS_KEY,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
          "User-Agent": "polish-exercises-tts",
        },
        body: ssml(text, voice),
      },
    );
    if (!res.ok) return null;
    const audio = await res.arrayBuffer();
    return audio.byteLength > 0 ? audio : null;
  } catch {
    return null;
  }
}

export async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== "/tts") return plain(404, "not found");

  const origin = allowedOrigin(request, env);
  if (!origin) return plain(403, "origin not allowed");
  const cors = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Range",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  if (request.method !== "GET") return plain(405, "method not allowed", { ...cors, Allow: "GET, OPTIONS" });

  const voice = url.searchParams.get("voice") || DEFAULT_VOICE;
  if (!isVoice(voice)) return plain(400, "unknown voice", cors);
  const text = normaliseText(url.searchParams.get("text") ?? "");
  const problem = textProblem(text);
  if (problem) return plain(400, problem, cors);

  const key = await audioKey(voice, text);
  // keyed by the hash, not the raw URL, so spacing variants share one entry
  const cacheKey = new Request(new URL(`/${key}`, url.origin).toString());
  const edge = caches.default;
  const range = request.headers.get("Range");

  const cached = await edge.match(cacheKey);
  if (cached) return audioResponse(await cached.arrayBuffer(), range, cors);

  let audio: ArrayBuffer;
  const stored = await env.AUDIO.get(key);
  if (stored) {
    audio = await stored.arrayBuffer();
  } else {
    // only misses cost money, so only misses count towards the limit
    if (env.MISS_LIMITER) {
      const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const { success } = await env.MISS_LIMITER.limit({ key: ip });
      if (!success) {
        return plain(429, "too many new sentences, try again in a minute", {
          ...cors,
          "Retry-After": "60",
        });
      }
    }
    const fresh = await synthesise(text, voice, env);
    if (!fresh) return plain(502, "speech service failed", cors);
    audio = fresh;
    try {
      await env.AUDIO.put(key, audio.slice(0), {
        httpMetadata: { contentType: "audio/mpeg", cacheControl: IMMUTABLE },
      });
    } catch {
      // still serve what we paid for; the next request will try storing again
    }
  }
  ctx.waitUntil(
    edge.put(
      cacheKey,
      new Response(audio.slice(0), {
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": IMMUTABLE },
      }),
    ),
  );
  return audioResponse(audio, range, cors);
}

export default {
  fetch: handle,
} satisfies ExportedHandler<Env>;
