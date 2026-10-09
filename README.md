# Ćwiczenia — Polish practice

Fill-in-the-blank drills for Polish, in the style of courseofpolish.com. The home
page (`/`) is a menu of exercises:

| Route | Exercise |
| --- | --- |
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

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # grammar engine, content gate, fuzz and golden tests (two vitest projects)
npm run lint
npm run build   # static site in out/
npx tsc --noEmit  # after a build (Next generates some types during it)
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

The same `out/` folder works on any static host.

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
| `lib/nouns.ts` | The nouns (306 incl. drafts) with their full 14-form paradigms (declension is too irregular to derive) |
| `lib/adjectives.ts` | The adjectives (150 incl. drafts) as stem + hardness, and which ones go with which noun; only the masculine-personal nominative plural is stored |
| `lib/declineAdjective.ts` | The regular adjective endings |
| `lib/templates.ts` | The sentence frames (319 incl. drafts), one per case/trigger, with an English gloss and the rule that applies |
| `lib/generate.ts` | Picks a template, a noun that semantically fits it and an adjective, then builds the exercise |
| `lib/agreement.ts` | Sentence frames, English gloss and distractors shared by the two agreement drills |
| `lib/pronouns.ts` | The `ten` / `tamten` paradigm — builds the demonstrative-pronoun exercise |
| `lib/possessives.ts` | The `mój` and `nasz` paradigms (and the indeclinable `jego` / `jej` / `ich`) — builds the possessive exercise |
| `lib/numerals.ts` | Cardinals to 9999, the oblique `-u` forms, the 1 / 2-4 / 5+ government rule, ordinals and the months |
| `lib/numbers.ts` | Builds the four numeral drills on top of it |
| `lib/verbs.ts` | Verbs (139 incl. drafts; aspect pairs plus imperfective-only verbs) stored as principal parts (past stems, non-past, imperative); builds the five tense drills, places `się` and builds the English verb. Also the verbs SRS card ids (`verbs:pisać\|past`, skill `verbs:past\|3pl`), one exercise per card (`buildVerbCard`), and `diagnoseVerbMiss` (aspect / person / tense slips) |
| `lib/cards/verbs.ts` | The verbs drill's SRS card source: every drillable verb × tense, levelled (present A1; past, futures and imperative A2), with learner-facing skill names |
| `lib/session.ts` | Encodes a session in the query string and reads it back (`type=` selects the drill, `lvl=` caps the CEFR level; drill-specific params come from the registry) |
| `lib/review/`, `scripts/review-*.ts` | The native-speaker review sheet: CSV export and import of draft entries |
| `lib/grade.ts` | Normalises the answer; a diacritics-only miss is reported separately |
| `lib/sound.ts` | Synthesised right / near-miss / wrong cues |
| `lib/speak.ts` | pl-PL speech synthesis for reading sentences aloud (TTS Worker audio when configured, else the browser) |
| `lib/speaker.ts` | Worker-vs-browser selection and fallback, testable without a browser |
| `lib/ttsUrl.ts` | The Worker URL for a sentence (and voice) |
| `scripts/audio/` | The pre-rendered audio pipeline: manifest, render engines, R2 upload (see [Audio](#audio)) |
| `workers/tts/` | The Cloudflare Worker that serves sentence audio from R2 (its own package and README) |

Semantic tags on each noun (`food`, `vehicle`, `placeIn`, …) keep sentences sensible —
`Jem …` only ever takes food, `Jadę …` only vehicles.

Sessions are seeded from the URL (`/practice?cases=gen,loc&num=sg&mode=both&count=20&seed=42`),
so a session can be reproduced or shared. Settings and lifetime per-case accuracy live in
localStorage.
