# Phase 1: Content and audio

Grow the lexicon 2–4× and replace the device voice with natural audio.
Baseline after Phase 0: 125 nouns, 74 adjectives, 32 verb pairs, 142 case templates.

| | Today | Target |
| --- | --- | --- |
| Nouns | 125 | 300 |
| Adjectives | 74 | 150 |
| Verb pairs | 32 | 120 |
| Case templates | 142 | 300 |

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

### 1.2 Nouns: 125 → 300 ☐ (wave 2)

`data/nouns.json` only. Fill the semantic tags templates use (food, placeIn,
vehicle…), with special care for thin ones; every tag should end up with at least
8 nouns. Watch gender (`mPers` / `mAnim` / `mInan` / `f` / `n`), mobile vowels,
consonant alternations in the locative and dative, and the vocative.

### 1.3 Adjectives: 74 → 150 ☐ (wave 2)

`data/adjectives.json` only. Include a balanced share of soft-stem and velar
adjectives, and check `virilePl` alternations (-szy, -cy, -dzy, -rzy).

### 1.4 Verbs: 32 → 120 pairs ☐ (wave 2)

`data/verbs.json` only. Aspect pairs with exact past stems, the non-past 1sg /
2sg / 3pl, and imperatives. Include about 25% reflexive verbs and the common
motion verbs. Verbs whose objects have no sensible sentence wait for 1.6.

### 1.5 Natural audio ☐ (wave 1, independent)

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

### 1.6 Templates and collocations: 142 → 300 ☐ (wave 3)

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
