# Ćwiczenia — Polish practice

Fill-in-the-blank drills for Polish, in the style of courseofpolish.com. The home
page (`/`) is a menu of exercises:

| Route | Exercise |
| --- | --- |
| `/cases` | Decline nouns / adjectives across all seven cases. |
| `/pronouns` | Make the demonstrative `ten` / `tamten` agree with a given noun in gender, number and case. |
| `/possessives` | Make the possessive (`mój`, `twój`, `nasz`, `wasz`, `swój`) agree with a given noun — and leave `jego` / `jej` / `ich` alone. |
| `/numbers` | Four numeral drills: the noun after a number (`dwa koty` / `pięć kotów`), the numeral's own form, writing figures out in words, and ordinals with dates and clock times. |
| `/verbs` | Conjugate a verb — plain or reflexive (`uczyć się`) — in the present (`piszę`), past (`napisałam`), simple future (`napiszę`), compound future (`będę pisać` / `będę pisał`) or the imperative (`napisz!` / `nie pisz!` / `napiszmy!`). |

Configure the cases (and word type / demonstrative), then answer one sentence at a
time with its English translation, and get the correct form plus the rule behind it
after every answer.

Audio: short synthesised cues mark right / near-miss / wrong (Web Audio, no asset
files), and the sentence is read aloud in Polish through the browser's speech
synthesis — 🔈 on the card replays it, and the full correct sentence is read back
once the answer is revealed. The 🔊 toggle in the header mutes both and is
remembered.

Natural voices (optional): build with `NEXT_PUBLIC_TTS_URL` pointing at the TTS
Worker in `workers/tts/` and sentences are read by an Azure Neural pl-PL voice,
cached in R2 so each sentence is paid for once. Any failure, or being offline,
falls back to the browser's speech synthesis. Without the variable nothing
changes. Deploying the Worker and setting the variable on Cloudflare Pages:
[`workers/tts/README.md`](workers/tts/README.md).

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # grammar engine + generator fuzz tests
npm run build   # static site in out/
```

## Deploying

The app is a fully static export (`output: "export"`) — no server, no adapter.
On Cloudflare Pages, connect the repo and set:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `out` |

The same `out/` folder works on any static host.

## How exercises are made

Everything is generated locally and deterministically — no API calls.

| File | Role |
| --- | --- |
| `data/*.json` | The lexicon: nouns, adjectives, collocations, sentence templates and verbs (schemas in [`data/README.md`](data/README.md)) |
| `lib/load.ts` | Validates the JSON and turns it into typed entries; throws on a malformed entry, naming it |
| `lib/nouns.ts` | ~125 nouns with their full 14-form paradigms (declension is too irregular to derive) |
| `lib/adjectives.ts` | ~74 adjectives as stem + hardness, and which ones go with which noun; only the masculine-personal nominative plural is stored |
| `lib/declineAdjective.ts` | The regular adjective endings |
| `lib/templates.ts` | ~140 sentence frames, one per case/trigger, with an English gloss and the rule that applies |
| `lib/generate.ts` | Picks a template, a noun that semantically fits it and an adjective, then builds the exercise |
| `lib/agreement.ts` | Sentence frames, English gloss and distractors shared by the two agreement drills |
| `lib/pronouns.ts` | The `ten` / `tamten` paradigm — builds the demonstrative-pronoun exercise |
| `lib/possessives.ts` | The `mój` and `nasz` paradigms (and the indeclinable `jego` / `jej` / `ich`) — builds the possessive exercise |
| `lib/numerals.ts` | Cardinals to 9999, the oblique `-u` forms, the 1 / 2-4 / 5+ government rule, ordinals and the months |
| `lib/numbers.ts` | Builds the four numeral drills on top of it |
| `lib/verbs.ts` | ~32 aspect pairs (9 reflexive) stored as principal parts (past stems, non-past, imperative); builds the five tense drills and places `się` |
| `lib/session.ts` | Encodes a session in the query string and reads it back (`type=pronouns` / `type=possessives` / `type=numbers` / `type=verbs` select the other drills) |
| `lib/grade.ts` | Normalises the answer; a diacritics-only miss is reported separately |
| `lib/sound.ts` | Synthesised right / near-miss / wrong cues |
| `lib/speak.ts` | pl-PL speech synthesis for reading sentences aloud (TTS Worker audio when configured, else the browser) |
| `lib/speaker.ts` | Worker-vs-browser selection and fallback, testable without a browser |

Semantic tags on each noun (`food`, `vehicle`, `placeIn`, …) keep sentences sensible —
`Jem …` only ever takes food, `Jadę …` only vehicles.

Sessions are seeded from the URL (`/practice?cases=gen,loc&num=sg&mode=both&count=20&seed=42`),
so a session can be reproduced or shared. Settings and lifetime per-case accuracy live in
localStorage.
