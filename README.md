# Ćwiczenia — Polish practice

Fill-in-the-blank drills for Polish, in the style of courseofpolish.com. The home
page (`/`) starts with a **Today's practice** button (streak, today's goal, reviews
due), then a menu of exercises:

| Route | Exercise |
| --- | --- |
| `/today` | Today's practice: due reviews first, then new words, then filler, built from your progress with no setup. A wrong answer is asked again at the end. "Extra practice" (weakest skills) once nothing is due. |
| `/progress` | Streak (with one grace day per week), today's goal, the last 28 days, your weak spots with their most common mistakes and a link to drill each, and the daily goal (10 / 20 / 40) and new words per day settings. |
| `/privacy` | The privacy policy: what stays on the device, what analytics collect (only with consent), your rights; change the analytics choice or delete your data from this device. |
| `/cases` | Decline nouns / adjectives across all seven cases. |
| `/pronouns` | Make the demonstrative `ten` / `tamten` agree with a given noun in gender, number and case. |
| `/possessives` | Make the possessive (`mój`, `twój`, `nasz`, `wasz`, `swój`) agree with a given noun — and leave `jego` / `jej` / `ich` alone. |
| `/numbers` | Four numeral drills: the noun after a number (`dwa koty` / `pięć kotów`), the numeral's own form, writing figures out in words, and ordinals with dates and clock times. |
| `/shuffle` | Every drill mixed into one session. |
| `/verbs` | Conjugate a verb — plain or reflexive (`uczyć się`) — in the present (`piszę`), past (`napisałam`), simple future (`napiszę`), compound future (`będę pisać` / `będę pisał`) or the imperative (`napisz!` / `nie pisz!` / `napiszmy!`). |

Each exercise has a configurator (cases, word type, level…), then you answer one sentence at a
time with its English translation, and get the correct form plus the rule behind it
after every answer.

Audio: short synthesised cues mark right / near-miss / wrong (Web Audio, no asset
files), and the sentence is read aloud in Polish through the browser's speech
synthesis — 🔈 on the card replays it, and the full correct sentence is read back
once the answer is revealed. The 🔊 toggle in the header mutes both and is
remembered.

Natural voices (optional): build with `NEXT_PUBLIC_TTS_URL` pointing at the TTS
Worker in `workers/tts/` and sentences are read by a natural pl-PL voice from
R2: every sentence pre-rendered ahead of time (see [Audio](#audio)), with Azure
Neural TTS optionally filling any gap. Any failure, or being offline, falls
back to the browser's speech synthesis. Without the variable nothing changes.

Install and offline: the built site is a PWA. Browsers offer to install it
(Android / desktop Chrome: the install prompt or menu; iOS Safari: Share → Add
to Home Screen), and it opens on `/today` in its own window. After the first
visit every page works offline, including `/today`, `/progress` and any
`/practice?…` session: progress lives in localStorage anyway. Natural-voice
clips heard online (up to the last 300) replay offline; any other sentence is
read by the browser voice. A new deploy is picked up in the background and
takes over the next time the app is opened, never in the middle of a session.

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # grammar engine, content gate, fuzz and golden tests (two vitest projects)
npm run lint
npm run build   # static site in out/, then stamps out/sw.js (offline precache)
npx tsc --noEmit  # after a build (Next generates some types during it)
npm run icons   # regenerate every icon from public/brand/icon.svg (see Icons)
```

Working on the code (or an AI agent working on it)? Read [`AGENTS.md`](AGENTS.md)
first. It has the codebase map, the rules that are easy to break (golden
snapshot, data order, drafts) and how to add a word, a template or a drill. The
product roadmap and phase status are in [`plans/`](plans/ROADMAP.md).

New content goes in as drafts that a native speaker approves before learners
see them: `npm run dev:drafts` shows them, and `npm run review:export` /
`npm run review:import` run the review sheet (see [`data/README.md`](data/README.md#drafts-and-review)).

## Deploying

The app is a fully static export (`output: "export"`) — no server, no adapter.
On Cloudflare Pages, connect the repo and set:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `out` |

The same `out/` folder works on any static host. Always build with
`npm run build`, not `next build` alone: the second step
(`scripts/sw-manifest.ts`) writes this build's version and file list into
`out/sw.js` and `out/sw-precache.json`. A bare `next build` ships the
unstamped worker, which caches nothing and unregisters itself.

The service worker is served at `/sw.js` and registered with
`updateViaCache: "none"`, so no cache header is needed for it. It treats
`/today`, `/today/` and `/today.html` as the same page (Cloudflare Pages serves
`today.html` at `/today`; plain static servers only at `/today.html`). It is
registered in production builds only, never under `npm run dev`.

## Icons

Every icon comes from one file, `public/brand/icon.svg`. `npm run icons`
renders it (with sharp, which Next already installs) to
`public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png` (logo in the
central 80% on the accent colour), `app/apple-icon.png` (180 px, opaque) and
`app/favicon.ico` (16 / 32 / 48 px). Commit the results.

While the brand is a placeholder, `icon.svg` is itself generated: the first
letter of `BRAND.name` (`lib/brand.ts`) in white on `--accent` from
`app/globals.css`, rewritten on every run. After a rename, `npm run icons` is
all it takes. For a real logo, replace `public/brand/icon.svg` (the script
then keeps it, since it no longer carries the "generated by scripts/icons.ts"
marker) and run `npm run icons`. The manifest (`app/manifest.ts`) reads the
name from `BRAND` and its colours from `--background` in `app/globals.css`.

## Analytics and privacy

Analytics are **off unless the build has a PostHog key and the learner says
yes**. Without `NEXT_PUBLIC_POSTHOG_KEY` (development, tests, any build that
does not set it) nothing analytics-related loads or renders.

| Env var (build time) | Meaning |
| --- | --- |
| `NEXT_PUBLIC_POSTHOG_KEY` | The PostHog project API key (`phc_…`). Unset: analytics off, no banner. |
| `NEXT_PUBLIC_POSTHOG_HOST` | Optional. Defaults to PostHog's EU cloud, `https://eu.i.posthog.com`; set it only for a reverse proxy. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | The contact address shown in the privacy policy (`lib/brand.ts`); unset shows "contact address coming soon". |

With a key, a banner asks once ("Allow analytics" / "No thanks", equal
weight, linking to `/privacy`). The choice is stored in localStorage
(`polish.consent.v1`) and can be changed on `/privacy`. Before a "yes",
posthog-js is not even downloaded (it is a lazy chunk), so no request, cookie or
storage entry exists. Withdrawing consent opts PostHog out, resets it and
deletes its `ph_*` cookie and storage.

Events (props are checked against a fixed schema in `lib/analytics.ts`: enum
values and counts only, never answer text):

| Event | Props |
| --- | --- |
| `$pageview` | PostHog's own, on load and on every client-side navigation (`capture_pageview: "history_change"`) |
| `session_started` | `source` (`today` / `practice`), `drill` (the session's kind; today's practice is `shuffle`), `size`. A "retry missed" round counts as a new session |
| `answer` | `drill`, `verdict` (`correct` / `diacritics` / `wrong`) |
| `session_finished` | `source`, `size` (scored questions), `correct` |
| `goal_met` | `goal`, `streak`, at most once per day |
| `pwa_installed` | none; from the browser's `appinstalled` event or the app's `pwa-installed` window event |

Autocapture, session recording, surveys, heatmaps and feature flags are off;
`respect_dnt` is on.

**Owner setup in PostHog** (once):

1. Create the project in **PostHog Cloud EU** (eu.posthog.com) and copy its
   project API key into `NEXT_PUBLIC_POSTHOG_KEY` in the Pages build settings.
2. Project settings: turn on **Discard client IP data** (the privacy policy
   says the IP address is discarded), and set the data retention to **12
   months** (the policy says so; change both together). Sign PostHog's DPA.
3. **Day-7 retention:** Product analytics → New insight → **Retention**.
   Cohortizing event `session_started`, returning event `session_started`,
   period **Day**, "first time" (recurring off). Read the **Day 7** column: the
   share of people who started a session on day 0 and started one again
   seven days later. Save it to a dashboard.

The privacy policy (`/privacy`) is a draft for the owner to review: it names
`BRAND.owner` and `BRAND.email` from `lib/brand.ts`, explains what stays on the
device, what PostHog receives, the TTS Worker and the learner's GDPR rights, and
has the consent toggle and a "Delete my data from this device" button (removes
every `polish.*` localStorage key after a confirmation). Update its "Last
updated" date with every change.

## Audio

The drills can only say a finite set of sentences (about 55,000 distinct
strings, 1.4M characters), so every one is rendered ahead of time and stored in
the TTS Worker's R2 bucket. The Worker then serves R2 hits only, with no
per-request TTS cost and no rate limit; Azure is optional (see
[`workers/tts/README.md`](workers/tts/README.md) for deploying the Worker).

| Variable (app build) | |
| --- | --- |
| `NEXT_PUBLIC_TTS_URL` | The Worker's URL. Unset: browser speech only. |
| `NEXT_PUBLIC_TTS_VOICE` | The voice to request. Default `pl-PL-ZofiaNeural`; for clips from another engine, the label they were rendered under (e.g. `piper-pl-gosia`), which must also be in the Worker's `EXTRA_VOICES`. |

The pipeline, from the repo root. Re-run all three after each approved content
batch: only new sentences get rendered and uploaded.

```bash
npm run audio:manifest                       # 1. audio/manifest.jsonl
npm run audio:render -- --engine azure       # 2. audio/out/<voice>/<hash>.mp3, missing ones only
npm run audio:upload                         # 3. audio/out → R2, new ones only
```

**1. Manifest.** `npm run audio:manifest [-- --voice <voice>] [--spell-max 9999]`
samples every drill with many seeds under every setting that changes what it
says (each case, number, word mode, demonstrative, possessor, tense, verb type
and numbers sub-drill, plus each drill's shuffle mix) until 15 rounds in a row
add nothing, and collects exactly what the client speaks: the gapped prompt
(`spokenGap(renderPrompt(…))`) and the full sentence (`renderSolution(…)`).
Published content only. Each line is `{key, voice, text}` with
`key = sha256(voice + "\n" + normalised text)`, the hash the Worker computes;
the R2 object is `audio/<voice>/<key>.mp3`. Both sides import the same code
(`workers/tts/src/text.ts`), and a test drives the Worker with the client's URL
to check the keys agree. The file is sorted by key so batches diff cleanly, and
it is committed (about 8 MB). It takes about 1.5 minutes and prints per-drill
counts and the total characters (the cost basis for Azure).

The spelling drill ("write 4729 out in words") is pre-rendered up to **1000**
by default: the 20, 100 and 1000 settings are covered in full, while the 9,000
figures from 1001 to 9999 that only the "to 9999" setting reaches are left out.
`--spell-max 9999` adds them (about 0.3M more characters). A sentence not in R2
is synthesised by Azure if the Worker has a key, otherwise it gets a 404 and the
app reads it with the browser voice. Everything else in the numbers drill is
covered in full.

**2. Render.** `npm run audio:render -- --engine <azure|piper|cmd> [--voice …] [--concurrency N] [--limit N]`
renders only the keys missing from `audio/out/<voice>/`; each file is written
atomically, so it can be stopped and re-run at any time. `--limit 20` is handy
for listening to a sample first. Every clip is MP3, 24 kHz mono, 48 kbit/s,
like the Worker's Azure output.

| Engine | Needs | `--voice` |
| --- | --- | --- |
| `azure` | `AZURE_TTS_KEY`, `AZURE_TTS_REGION` (an Azure Speech resource). Same SSML as the Worker, 8 requests at a time by default, retries 429/5xx with backoff (honouring `Retry-After`). | An Azure voice; default `NEXT_PUBLIC_TTS_VOICE`, else `pl-PL-ZofiaNeural` |
| `piper` | `PIPER_MODEL` (path to the `.onnx` voice; its `.onnx.json` next to it), `PIPER_BIN` (default `piper`), optional `PIPER_ARGS` (e.g. `--length_scale 1.1` to read 10% slower, like the Worker), `FFMPEG_BIN` (default `ffmpeg`) | Your own label, e.g. `piper-pl-gosia` |
| `cmd` | `--cmd "<template>"` with `{text_file}` and `{out}` placeholders, optional `--cmd-ext` (the extension `{out}` gets, default `wav`), `FFMPEG_BIN` | Your own label |

A label is letters, digits and dashes (at most 64) and must not be an Azure
voice name, so clips from another engine are never served as Azure's.

*Piper* is a fast, local, open-source TTS engine: download a release binary for
your OS from <https://github.com/rhasspy/piper/releases> (MIT licensed; the
project has since continued as OHF-Voice/piper1-gpl, installed with
`pip install piper-tts`, under its own licence, so check which one you use),
and a Polish voice (`pl_PL-…`, an `.onnx` file plus its `.onnx.json`) from
<https://huggingface.co/rhasspy/piper-voices/tree/main/pl/pl_PL>. The engine
runs `$PIPER_BIN --model $PIPER_MODEL $PIPER_ARGS --output_file <wav>` with the
sentence on stdin; flag spellings can differ between Piper builds (check
`piper --help`), and any build that differs can be driven through `cmd`
instead. **Each voice model has its own licence, separate from Piper's: read
the voice's model card and check it allows commercial use before rendering
clips for the app.** Then, for example:

```bash
PIPER_MODEL=~/voices/pl_PL-<voice>-medium.onnx PIPER_ARGS="--length_scale 1.1" \
  npm run audio:render -- --engine piper --voice piper-pl-<voice>
```

*cmd* runs any command-line TTS tool (another open-source model, a desktop TTS
app with a CLI…). The sentence is written to a UTF-8 temporary file and also
given on stdin; `{text_file}` and `{out}` are replaced by quoted temporary
paths, and the sentence itself never appears in the shell command. If the tool
writes anything but MP3, ffmpeg converts it. For example:

```bash
npm run audio:render -- --engine cmd --voice local-pl-anna \
  --cmd 'my-tts --voice anna --input {text_file} --output {out}'
```

**3. Upload.** `npm run audio:upload [-- --concurrency N] [--recheck]` puts
every clip in `audio/out/` that is not in the bucket yet at
`audio/<voice>/<hash>.mp3`, with `Content-Type: audio/mpeg` and the Worker's
`Cache-Control: public, max-age=31536000, immutable`, via R2's S3-compatible API.
It needs `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (Cloudflare
dashboard → R2 → *Manage API tokens*, Object Read & Write on the bucket) and
`R2_BUCKET` (`polish-exercises-tts` in `workers/tts/wrangler.toml`). Uploaded
keys go in `audio/uploaded.txt`, so a re-run skips them; anything not listed
there is checked with HEAD first. `--recheck` forgets the list.

`audio/out/` and `audio/uploaded.txt` are git-ignored. To switch voices, render
and upload the new one, list it in the Worker's `EXTRA_VOICES` if it is not an
Azure voice, then rebuild the app with `NEXT_PUBLIC_TTS_VOICE` set to it.

## How exercises are made

Everything is generated locally and deterministically — no API calls.

| File | Role |
| --- | --- |
| `data/*.json` | The lexicon: nouns, adjectives, collocations, sentence templates, verbs and the agreement / counting / numeral frames (schemas in [`data/README.md`](data/README.md)) |
| `lib/load.ts` | Validates the JSON and turns it into typed entries; throws on a malformed entry, naming it. Leaves drafts out of the published lexicon |
| `lib/lexicon.ts` | Loads every data file once; drafts only with `NEXT_PUBLIC_INCLUDE_DRAFTS=1` |
| `lib/drills.ts` | The drill registry: route, menu text, builder, URL params and shuffle mix for each drill |
| `lib/cards.ts`, `lib/cards/` | SRS card sources, one per drill (`DRILLS[kind].cards`): every card up to a level, one exercise for a given card, learner-facing skill names. Card ids: `plans/phase-2.md` §1 |
| `lib/diagnose.ts` | Why a wrong answer is wrong: `explainMiss` (the line the learner reads) and `diagnoseMiss` (the miss kind the weak-spots view counts) |
| `lib/nouns.ts` | The nouns (306 incl. drafts) with their full 14-form paradigms (declension is too irregular to derive) |
| `lib/adjectives.ts` | The adjectives (150 incl. drafts) as stem + hardness, and which ones go with which noun; only the masculine-personal nominative plural is stored |
| `lib/declineAdjective.ts` | The regular adjective endings |
| `lib/templates.ts` | The sentence frames (319 incl. drafts), one per case/trigger, with an English gloss and the rule that applies |
| `lib/generate.ts` | Picks a template, a noun that semantically fits it and an adjective, then builds the exercise |
| `lib/agreement.ts` | Sentence frames, English gloss and distractors shared by the two agreement drills |
| `lib/pronouns.ts` | The `ten` / `tamten` paradigm — builds the demonstrative-pronoun exercise |
| `lib/possessives.ts` | The `mój` and `nasz` paradigms (and the indeclinable `jego` / `jej` / `ich`) — builds the possessive exercise |
| `lib/numerals.ts` | Cardinals to 9999, the oblique `-u` forms, the 1 / 2-4 / 5+ government rule, ordinals and the months |
| `lib/numbers.ts` | Builds the four numeral drills on top of it; tags every exercise with its SRS card (`numbers:count\|5+\|acc`…) and builds one exercise for a given card |
| `lib/diagnoseNumbers.ts` | `diagnoseNumberMiss`: the miss kind of a wrong numbers answer, read from its card (noun in the wrong form after the numeral → government, numeral or ordinal in the wrong gender / case → numeralForm, typo, ending, word count) |
| `lib/cards/numbers.ts` | The numbers drill's SRS cards: the id scheme (count band, numeral class, spelling magnitude, ordinal flavour × case), their levels, order and learner-facing skill names |
| `lib/verbs.ts` | Verbs (139 incl. drafts; aspect pairs plus imperfective-only verbs) stored as principal parts (past stems, non-past, imperative); builds the five tense drills, places `się` and builds the English verb. Also the verbs SRS card ids (`verbs:pisać\|past`, skill `verbs:past\|3pl`), one exercise per card (`buildVerbCard`), and `diagnoseVerbMiss` (aspect / person / tense slips) |
| `lib/cards/verbs.ts` | The verbs drill's SRS card source: every drillable verb × tense, levelled (present A1; past, futures and imperative A2), with learner-facing skill names |
| `lib/srs.ts` | The spaced-repetition scheduler (SM-2 with right / accents-only / wrong) and local calendar-day helpers |
| `lib/progress.ts` | Learner progress from the answer log: per-card schedule, per-skill and per-day counts, log replay and compaction, v1 migration, streak (one grace day per 7 days), weak spots and the level cap for new cards |
| `lib/today.ts` | Builds "Today's practice": due reviews, then the day's new cards, then filler from weak skills, mixed across drills |
| `lib/session.ts` | Encodes a session in the query string and reads it back (`type=` selects the drill, `lvl=` caps the CEFR level; drill-specific params come from the registry) |
| `lib/review/`, `scripts/review-*.ts` | The native-speaker review sheet: CSV export and import of draft entries |
| `lib/grade.ts` | Normalises the answer; a diacritics-only miss is reported separately |
| `lib/storage.ts` | localStorage: last config per drill, sound, and the v2 answer log, progress cache and settings (with the one-time v1 migration) |
| `lib/progressView.ts` | Labels and links for the progress page: miss kinds in English, weak skill → practice URL, the day grid |
| `lib/missKind.ts` | The miss kind logged with a wrong answer |
| `components/Runner.tsx` | Runs a list of exercises and records every answer; used by `/practice` and `/today`. Sends the session and answer analytics events |
| `lib/analytics.ts` | Analytics with consent: `track` (a no-op without a key and consent), the consent state machine, the event schema, posthog-js loaded lazily from the EU host (see [Analytics and privacy](#analytics-and-privacy)) |
| `components/Analytics.tsx`, `components/ConsentBanner.tsx` | Mounted on every page: starts PostHog after an earlier consent, sends `pwa_installed`, shows the consent banner |
| `app/privacy/` | The privacy policy, with the consent toggle and the delete-my-data button |
| `lib/sound.ts` | Synthesised right / near-miss / wrong cues |
| `lib/speak.ts` | pl-PL speech synthesis for reading sentences aloud (TTS Worker audio when configured, else the browser) |
| `lib/speaker.ts` | Worker-vs-browser selection and fallback, testable without a browser |
| `lib/ttsUrl.ts` | The Worker URL for a sentence (and voice) |
| `scripts/audio/` | The pre-rendered audio pipeline: manifest, render engines, R2 upload (see [Audio](#audio)) |
| `workers/tts/` | The Cloudflare Worker that serves sentence audio from R2 (its own package and README) |
| `app/manifest.ts` | The web app manifest from `BRAND` (start `/today`, standalone, colours from `app/globals.css`) |
| `public/sw.js`, `scripts/sw-manifest.ts` | The offline service worker (a template) and the post-build step that stamps it with the version and precache list |
| `components/ServiceWorker.tsx` | Registers the worker in production builds; re-dispatches `appinstalled` as a window `pwa-installed` event |
| `public/brand/icon.svg`, `scripts/icons.ts` | The icon source and `npm run icons`, which renders every PNG / ICO from it |

Semantic tags on each noun (`food`, `vehicle`, `placeIn`, …) keep sentences sensible —
`Jem …` only ever takes food, `Jadę …` only vehicles.

Sessions are seeded from the URL (`/practice?cases=gen,loc&num=sg&mode=both&count=20&seed=42`),
so a session can be reproduced or shared. `/today` is the exception: it is built from
your stored progress. Settings, the answer log and the progress derived from it live in
localStorage (`polish.log.v2`, `polish.progress.v2`, `polish.settings.v2`).
