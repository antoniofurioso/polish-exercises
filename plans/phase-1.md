# Phase 1: Content and audio

Grow the lexicon 2–4× and replace the device voice with natural audio.
Baseline after Phase 0: 125 nouns, 74 adjectives, 32 verb pairs, 142 case templates.

| | Phase 0 | Target | Now (incl. drafts) |
| --- | --- | --- | --- |
| Nouns | 125 | 300 | 306 (181 drafts) |
| Adjectives | 74 | 150 | 150 (76 drafts) |
| Verbs | 32 pairs | 120 | 139 (107 drafts) |
| Case templates | 142 | 300 | 319 (177 drafts) |

## Status

**Code: done.** All tasks below are ☑. Beyond the original plan, this phase also
delivered:

- **A verb generator fix:** imperfective-only verbs (`pf` optional) and the
  `indeterminate`, `stative` and `orders` flags; English 3rd-person -s/-es/-ies
  and "be + adjective" bases. 19 high-frequency verbs were added (chodzić,
  mieszkać, wiedzieć, lubić…).
- **A cleanup pass:**
  - noun fields `noPossessive`, `portions` and `article` ("none" / "the");
  - frames honoured in the ordinal and count drills; mass nouns are not counted;
  - English articles chosen by sound ("a young", "an hour");
  - "z", not "ze", before "sz" + vowel.
  The golden snapshot changed only for these corrections; every changed line is
  listed in its commit.

**Waiting on the user, not on code:**

1. **Native review.** `npm run review:export` writes `review/pending.csv` (541
   rows). The reviewer fills `verdict` and `correction`, then
   `npm run review:import review/pending.csv` applies the verdicts. In the same
   commit, update the golden snapshot and run `npm run audio:manifest`.
   - **Also for the reviewer:** odd verb frames ("codziennie będziemy wynajmować
     mieszkanie", "Nie dziękuj sąsiadowi!"), "mały" glossed as "small" for
     relatives, "ze" before w + consonant, and the `noPossessive` / `portions`
     choices.
   - **Adjectives with no example sentence:** psi, koci, bezpośredni and wrogi
     have no noun that collocates with them.
2. **Audio: decided, deferred.** Engine: **Chatterbox Multilingual** (see
   "Engine choice" under 1.5b). Not rendered yet: the live app keeps the
   browser voice until real learners arrive, and rendering after the native
   review means paying the render time once.
   - When it is time: set up Chatterbox (steps under 1.5b), render 20 samples to
     check quality and speed, then the full set.
   - Upload to R2, deploy `workers/tts`, and set `NEXT_PUBLIC_TTS_URL`.
   - Steps are in the README "Audio" section and `workers/tts/README.md`.

## Ground rules for every content agent

1. **Everything new is a draft.** New entries carry `"review": "draft"` and are
   appended at the end of their file. Drafts are left out of the published app
   and only go live once a native speaker approves them (1.1 builds that flow).
2. **Only words you are sure of.** Agents write paradigms from their own
   knowledge, not from a dictionary download, so an entry goes in only when every
   form is certain. Accepted variants go in `alt`. When in doubt, leave the word
   out: a wrong form in a grammar app costs more than a missing word.
3. **Licence.** No bulk copying from Wiktionary (CC BY-SA, share-alike). If we
   later import from SGJP / Morfeusz, check its licence first.
4. **The gates stay green.** `npm test` (content gate included, drafts included),
   `npm run lint`, `npx tsc --noEmit`, `npm run build`. The golden snapshot runs
   on published content only, so drafts never change it.
5. **Levels.** Every new entry gets a `level` and `freq` by the rules in
   `data/README.md`. Prioritise A1–A2 frequency vocabulary, then B1, then B2,
   since B2 is empty today.

## Waves

```
Wave 1   1.1 review flow + remaining frames → data   ║  1.5 audio (TTS Worker)
            │                                          ║  (independent, runs alongside)
Wave 2   1.2 nouns   ║  1.3 adjectives   ║  1.4 verbs
            │
Wave 3   1.6 templates + collocations (needs the new nouns and adjectives)
            │
Human    native-speaker review of every draft → approve → golden snapshot updated
```

### 1.1 Review flow and the remaining frames ☑ (wave 1)

- Optional `review: "draft"` field on every kind of entry, validated by `lib/load.ts`.
- **Published vs draft.** By default the exported lexicon leaves drafts out. With
  `NEXT_PUBLIC_INCLUDE_DRAFTS=1` (dev and preview) they are in. The vitest setup
  runs the golden test on published content and the content gate with drafts in
  (for example two vitest projects with different `env`).
- **Review export.** `npm run review:export` writes `review/pending.csv`: one row
  per draft with its kind, lemma, level, every form, and 3 example sentences the
  generator builds with it, plus empty `verdict` (ok / fix / reject) and
  `correction` columns. It must open cleanly in Google Sheets or Excel (UTF-8 BOM).
- **Review import.** `npm run review:import review/pending.csv`: `ok` removes the
  `review` field, `reject` deletes the entry, and `fix` prints the correction for
  a human or an agent to apply. Re-running the import on the same file changes
  nothing more.
- **Remaining frames.** Move `AGREEMENT_TEMPLATES` (`lib/agreement.ts`) and
  `COUNT_TEMPLATES` / `NUMERAL_TEMPLATES` (`lib/numbers.ts`) into `data/`, with the
  same loader treatment as 0.2. The golden snapshot must stay unchanged.
- Document all of this in `data/README.md`.

### 1.2 Nouns: 125 → 300 ☑ (306, drafts) (wave 2)

`data/nouns.json` only. Fill the semantic tags templates use (food, placeIn,
vehicle…), with special care for thin ones; every tag should end up with at least
8 nouns. Watch gender (`mPers` / `mAnim` / `mInan` / `f` / `n`), mobile vowels,
consonant alternations in the locative and dative, and the vocative.

### 1.3 Adjectives: 74 → 150 ☑ (drafts) (wave 2)

`data/adjectives.json` only. Include a balanced share of soft-stem and velar
adjectives, and check `virilePl` alternations (-szy, -cy, -dzy, -rzy).

### 1.4 Verbs: 32 → 120 pairs ☑ (drafts) (wave 2)

`data/verbs.json` only. Aspect pairs with exact past stems, the non-past 1sg /
2sg / 3pl, and imperatives. Include about 25% reflexive verbs and the common
motion verbs. Verbs whose objects have no sensible sentence wait for 1.6.

### 1.5 Natural audio ☑ (wave 1, independent)

- `workers/tts/`: a Cloudflare Worker. `GET /tts?text=…` → SHA-256 of
  voice + text → R2 hit, or call Azure Neural TTS (pl-PL, e.g. `pl-PL-ZofiaNeural`)
  → store in R2 → return `audio/mpeg` with long-lived cache headers.
- Abuse limits: an `Origin` allow-list, a maximum text length, Polish-alphabet
  text only, and per-IP rate limiting.
- Client: when `NEXT_PUBLIC_TTS_URL` is set, `lib/speak.ts` plays the Worker's
  audio, and falls back to `speechSynthesis` on any error or when offline. The
  call sites keep the same API.
- Tests use a mocked fetch and a mocked R2. `wrangler.toml` plus a README on
  deploying it (Azure key as a secret, the R2 bucket). **Not deployed by the
  agent**: deploying needs the user's Azure and Cloudflare accounts.

### 1.5b Pre-rendered audio ☑ (with wave 2)

The set of sentences is finite. Sampling 400,000 questions per drill gives
about **62,000 distinct spoken strings** (the gapped sentence plus the full
solution), averaging 28 characters, so about 1.7M characters in total.

| Drill | Distinct | Saturated? |
| --- | --- | --- |
| cases | ~10,200 | yes |
| pronouns | ~1,300 | yes |
| possessives | ~4,900 | yes |
| verbs | ~11,000 | yes |
| numbers (to 9,999) | ~35,000 | still growing slowly |

That is small enough to render every sentence ahead of time, so there is no
per-request TTS cost and no rate limit:

- `npm run audio:manifest` enumerates every spoken string (saturating sampling
  per drill, published content only) into `audio/manifest.jsonl` with the same
  key the Worker uses: sha256(voice + "\n" + normalised text).
- `npm run audio:render -- --engine <piper|azure|cmd>` renders only the keys that
  are missing locally. `cmd` pipes the text to any local tool (an open-source
  model or a desktop TTS app), so the engine is a plug-in.
- `npm run audio:upload` syncs the new files to the R2 bucket.
- The Worker serves R2 hits as it does today. Azure becomes optional: with no
  key set, a miss returns 404 and the app falls back to the browser voice.
- Re-run after each approved content batch; only new sentences get rendered.

Done: the first `npm run audio:manifest` (published content, every drill
saturated: 15 rounds of 1,000 questions in a row with nothing new) gives
**60,390 clips, 1.56M characters** (cases 16,238, pronouns 1,923, possessives
5,513, numbers 27,202, verbs 10,995 before merging duplicates across drills),
an 8.5 MB manifest (committed), in about 1.5 minutes. The spelling drill is
pre-rendered up to 1000 (`--spell-max 9999` adds the other 9,000 figures);
beyond the cap the app falls back as for any miss. The rest of the numbers
drill saturates. Pipeline and engines: root README, "Audio".

At around 12 kB per clip the whole set is under 1 GB of R2 storage.

**Engine licence matters, since the app is commercial.** Checked 2026-10-10:

- **Piper: no Polish voice is usable.** The code is MIT, but every Polish voice
  is finetuned from a non-commercial base. gosia, darkman, mc_speech and bass
  (despite its "Apache 2.0" card) come from en_US-lessac, whose Blizzard 2013
  data is "Research Purposes only". mls_6892 comes from en_US-ryan, which is
  CC BY-NC-SA.
- **Out:** XTTS-v2 (Coqui Public Model License), Meta MMS-TTS (CC BY-NC),
  F5-TTS and Fish Speech (non-commercial weights). Kokoro, MeloTTS and Orpheus
  are permissive but have no Polish.
- **Fallback:** Azure neural voices, a one-off batch of about 1.6M characters
  (a small cost, or about 3 months of the free tier).

**Engine choice: Chatterbox Multilingual** (Resemble AI, `chatterbox-tts` on
PyPI). MIT, 23 languages including Polish, and the online demo sounded good.
Every clip carries an inaudible Perth watermark, which is fine here.

- **Voice:** cloned from about 10 s of reference audio. To keep the licence
  clean, take it from the **mc_speech dataset (CC0**, one female speaker,
  huggingface.co/datasets/czyzi0/the-mc-speech-dataset), or from a native
  speaker who signs off on it. Not the demo's default voice.
- **Setup:**
  - A Python 3.12 venv under `.tmp/`; downloads are about 2 GB of packages and
    3.3 GB of weights (needs disk space).
  - Plus `scripts/audio/chatterbox_server.py`, a small local HTTP server that
    keeps the model loaded. Our `cmd` engine starts a process per sentence, and
    reloading the model each time would be far too slow, so `--cmd` calls the
    server with `curl --data-binary @{text_file} … -o {out}`.
- **Speed:** unmeasured. On the M1 the full set may take days, so render 20
  samples first. A rented GPU for a few hours is the faster option.

### 1.6 Templates and collocations: 142 → 300 ☑ (319, drafts) (wave 3)

`data/templates.json`, `data/groups.json`, `data/collocations.json`. Cover every
case at every level A1–B2, with a natural English gloss and a one-line rule
note. Favour B1–B2 constructions, which are thin today. Add collocations for the
new nouns, so adjective + noun pairs make sense.

## Human step: native review

Until a reviewer approves drafts, the published app is unchanged. Approving a
batch updates the golden snapshot in the same commit, and that is the only time
it should change.

## Done when

The targets are reached as drafts with every gate green, the review export
works end to end, and the audio Worker is tested and documented, ready for the
user to deploy.
