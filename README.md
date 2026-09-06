# Ćwiczenia — Polish case practice

Fill-in-the-blank drills for Polish declension, in the style of courseofpolish.com.
Configure the cases, the word type and the length of the session, then answer one
sentence at a time with its English translation, and get the correct form plus the
rule behind it after every answer.

Audio: short synthesised cues mark right / near-miss / wrong (Web Audio, no asset
files), and the sentence is read aloud in Polish through the browser's speech
synthesis — 🔈 on the card replays it, and the full correct sentence is read back
once the answer is revealed. The 🔊 toggle in the header mutes both and is
remembered.

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
| `lib/nouns.ts` | ~85 nouns with their full 14-form paradigms (declension is too irregular to derive) |
| `lib/adjectives.ts` | ~32 adjectives as stem + hardness; only the masculine-personal nominative plural is stored |
| `lib/declineAdjective.ts` | The regular adjective endings |
| `lib/templates.ts` | ~80 sentence frames, one per case/trigger, with an English gloss and the rule that applies |
| `lib/generate.ts` | Picks a template, a noun that semantically fits it and an adjective, then builds the exercise |
| `lib/session.ts` | Encodes a session in the query string and reads it back |
| `lib/grade.ts` | Normalises the answer; a diacritics-only miss is reported separately |
| `lib/sound.ts` | Synthesised right / near-miss / wrong cues |
| `lib/speak.ts` | pl-PL speech synthesis for reading sentences aloud |

Semantic tags on each noun (`food`, `vehicle`, `placeIn`, …) keep sentences sensible —
`Jem …` only ever takes food, `Jadę …` only vehicles.

Sessions are seeded from the URL (`/practice?cases=gen,loc&num=sg&mode=both&count=20&seed=42`),
so a session can be reproduced or shared. Settings and lifetime per-case accuracy live in
localStorage.
