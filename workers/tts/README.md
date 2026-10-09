# TTS Worker — natural Polish audio

A Cloudflare Worker that serves a drill sentence as an MP3 from R2. Every
sentence the app can say is pre-rendered into the bucket ahead of time
(`npm run audio:manifest` → `audio:render` → `audio:upload`, see the root
README's [Audio](../../README.md#audio) section), so normally every request is
an R2 hit. Azure Neural TTS is optional: with `AZURE_TTS_KEY` set, a miss is
synthesised and stored so it is paid for once; without it, a miss is a 404.
The app uses the Worker when `NEXT_PUBLIC_TTS_URL` is set at build time and
falls back to the browser's speech synthesis on any error (a 404 included) or
when offline (`lib/speak.ts`, `lib/speaker.ts`).

## Endpoint

`GET /tts?text=<sentence>&voice=<voice>`

| | |
| --- | --- |
| `text` | Required. Trimmed, whitespace collapsed, Unicode NFC, then at most 300 characters of letters (ASCII + Latin-1 + Latin Extended-A, which covers all Polish diacritics), digits, spaces and `. , ! ? ; : ' " … - – — „ ” “ ( )`. |
| `voice` | Optional. `pl-PL-ZofiaNeural` (default), `pl-PL-MarekNeural` or `pl-PL-AgnieszkaNeural` (Azure voices), or a label listed in `EXTRA_VOICES` (pre-rendered by another engine, served from R2 only). The app sends `NEXT_PUBLIC_TTS_VOICE` when it is set. |
| `Origin` | Required: must be in `ALLOWED_ORIGINS`. The app sets `crossOrigin = "anonymous"` on its audio element so the browser sends it. |

Lookup order: edge cache (`caches.default`) → R2 `audio/<voice>/<sha256(voice + "\n" + text)>.mp3`
→ Azure (`audio-24khz-48kbitrate-mono-mp3`, SSML with `xml:lang="pl-PL"`, read at
`-10%` rate), only when `AZURE_TTS_KEY` and `AZURE_TTS_REGION` are set and the
voice is an Azure voice → stored in R2 and the edge cache. The text rules, the
key and the SSML live in `src/text.ts`, which the pre-render scripts import, so
a pre-rendered clip sits exactly where this lookup finds it
(`test/keys.test.ts` checks that against the client's URL).

| Status | When |
| --- | --- |
| 200 / 206 | `audio/mpeg`, `Cache-Control: public, max-age=31536000, immutable`; byte ranges are honoured |
| 204 | `OPTIONS` preflight from an allowed origin |
| 400 | empty, too long or disallowed text; unknown voice |
| 403 | missing or unknown `Origin` |
| 404 | not in R2 and nothing to synthesise with (no Azure key, or a non-Azure voice); CORS headers included, so the app falls back to the browser voice |
| 429 | too many cache misses from this IP (`Retry-After: 60`) |
| 502 | Azure failed; nothing is stored |

**Rate limit.** Only cache misses (new sentences, which cost money) are counted,
per client IP (`CF-Connecting-IP`), using the
[Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
`MISS_LIMITER` (30 new sentences per minute, set in `wrangler.toml`). Hits, and
misses answered with a 404 (no Azure), are never counted. The counters are per Cloudflare location and approximate, which
is fine for abuse control; tighten `limit` if needed. If the binding is absent
(e.g. an older local `wrangler dev`), no limit is applied.

## Deploy

You need a Cloudflare account. An Azure Speech resource (Azure portal →
*Create a resource* → *Speech*; note its **key** and **region**) is optional:
it fills gaps on the fly, and `npm run audio:render -- --engine azure` can use
the same resource to pre-render everything.

```bash
cd workers/tts
npm install
npx wrangler login

# 1. the bucket the clips live in (name must match wrangler.toml)
npx wrangler r2 bucket create polish-exercises-tts

# 2. optional: the Azure key, as a secret (never in wrangler.toml). Skip it to
#    serve pre-rendered clips only; a miss is then a 404 and the browser reads it.
npx wrangler secret put AZURE_TTS_KEY

# 3. edit wrangler.toml [vars]: AZURE_TTS_REGION = your Speech resource's region,
#    ALLOWED_ORIGINS = your Pages URL(s), comma-separated, plus any custom domain,
#    EXTRA_VOICES = labels of voices pre-rendered with Piper or another local
#    engine (e.g. "piper-pl-gosia"), if you use one

# 4. deploy
npx wrangler deploy

# 5. fill the bucket, from the repo root (root README, "Audio")
cd ../.. && npm run audio:manifest && npm run audio:render -- --engine azure && npm run audio:upload
```

`wrangler deploy` prints the Worker's URL, e.g.
`https://polish-exercises-tts.<account>.workers.dev`. Check it:

```bash
curl -s -o /tmp/kot.mp3 -w '%{http_code} %{content_type}\n' \
  -H 'Origin: https://polish-exercises.pages.dev' \
  'https://polish-exercises-tts.<account>.workers.dev/tts?text=Mam%20kota.'
```

Then point the app at it: Cloudflare dashboard → *Workers & Pages* → the Pages
project → *Settings* → *Variables and Secrets* → add `NEXT_PUBLIC_TTS_URL` =
the Worker URL (no trailing slash needed) for Production (and Preview if you
want), and redeploy. The value is inlined at build time, so it only takes effect
on the next build. Preview deployments get their own `*.pages.dev` hostnames;
add them to `ALLOWED_ORIGINS` or they will quietly use the browser voice.

For local development, add `http://localhost:3000` to `ALLOWED_ORIGINS` (it is
there by default) and run the app with
`NEXT_PUBLIC_TTS_URL=https://… npm run dev`. To run the Worker locally, put
`AZURE_TTS_KEY=…` in `workers/tts/.dev.vars` (git-ignored) and `npm run dev`.

## Cost

Azure Neural TTS is billed per character synthesised (check current Azure
pricing for your region and tier; there is a monthly free allowance on the free
tier). Pre-rendering the whole manifest is a one-off batch of about 1.6M
characters (`npm run audio:manifest` prints the exact total), and each content
batch after that only renders its new sentences; a local engine (Piper or
`cmd`) costs nothing per character. Because clips are stored in R2 under a hash
of voice + text, each distinct sentence is synthesised once, and every play is
an R2 read or an edge-cache hit. R2 storage and reads are cheap at this size (a
clip is roughly 6 kB per second of speech, so about 60,000 clips are well under
1 GB) and R2 has no egress fees. With Azure on, the rate limit caps how fast
anyone can make you pay for new sentences.

## Tests

```bash
cd workers/tts
npm test           # vitest: mocked fetch, R2, edge cache and rate limiter; keys agree with scripts/audio
npm run typecheck
```
