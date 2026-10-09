# TTS Worker — natural Polish audio

A Cloudflare Worker that turns a drill sentence into an MP3 read by an Azure
Neural voice, and keeps every clip in R2 so each sentence is paid for once.
The app uses it when `NEXT_PUBLIC_TTS_URL` is set at build time and falls back
to the browser's speech synthesis on any error or when offline
(`lib/speak.ts`, `lib/speaker.ts`).

## Endpoint

`GET /tts?text=<sentence>&voice=<voice>`

| | |
| --- | --- |
| `text` | Required. Trimmed, whitespace collapsed, Unicode NFC, then at most 300 characters of letters (ASCII + Latin-1 + Latin Extended-A, which covers all Polish diacritics), digits, spaces and `. , ! ? ; : ' " … - – — „ ” “ ( )`. |
| `voice` | Optional. `pl-PL-ZofiaNeural` (default), `pl-PL-MarekNeural` or `pl-PL-AgnieszkaNeural`. |
| `Origin` | Required: must be in `ALLOWED_ORIGINS`. The app sets `crossOrigin = "anonymous"` on its audio element so the browser sends it. |

Lookup order: edge cache (`caches.default`) → R2 `audio/<voice>/<sha256(voice + "\n" + text)>.mp3`
→ Azure (`audio-24khz-48kbitrate-mono-mp3`, SSML with `xml:lang="pl-PL"`, read at
`-10%` rate) → stored in R2 and the edge cache.

| Status | When |
| --- | --- |
| 200 / 206 | `audio/mpeg`, `Cache-Control: public, max-age=31536000, immutable`; byte ranges are honoured |
| 204 | `OPTIONS` preflight from an allowed origin |
| 400 | empty, too long or disallowed text; unknown voice |
| 403 | missing or unknown `Origin` |
| 429 | too many cache misses from this IP (`Retry-After: 60`) |
| 502 | Azure failed; nothing is stored |

**Rate limit.** Only cache misses (new sentences, which cost money) are counted,
per client IP (`CF-Connecting-IP`), using the
[Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
`MISS_LIMITER` (30 new sentences per minute, set in `wrangler.toml`). Hits are
never counted. The counters are per Cloudflare location and approximate, which
is fine for abuse control; tighten `limit` if needed. If the binding is absent
(e.g. an older local `wrangler dev`), no limit is applied.

## Deploy

You need a Cloudflare account and an Azure Speech resource (Azure portal →
*Create a resource* → *Speech*; note its **key** and **region**).

```bash
cd workers/tts
npm install
npx wrangler login

# 1. the bucket the clips live in (name must match wrangler.toml)
npx wrangler r2 bucket create polish-exercises-tts

# 2. the Azure key, as a secret (never in wrangler.toml)
npx wrangler secret put AZURE_TTS_KEY

# 3. edit wrangler.toml [vars]: AZURE_TTS_REGION = your Speech resource's region,
#    ALLOWED_ORIGINS = your Pages URL(s), comma-separated, plus any custom domain

# 4. deploy
npx wrangler deploy
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
tier). Because clips are stored in R2 under a hash of voice + text, each
distinct sentence is synthesised and paid for once, and every later play is an
R2 read or an edge-cache hit. R2 storage and reads are cheap at this size (a
clip is roughly 6 kB per second of speech) and R2 has no egress fees. The
rate limit caps how fast anyone can make you pay for new sentences.

## Tests

```bash
cd workers/tts
npm test           # vitest: mocked fetch, R2, edge cache and rate limiter
npm run typecheck
```
