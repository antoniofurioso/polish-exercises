<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Ćwiczenia: project guide for agents

A Polish grammar drill app (fill-in-the-blank, with English translation and the
rule after every answer) on its way to becoming a paid product: web first (PWA),
then the app stores. The roadmap and phase status live in `plans/`, and the
user-facing overview is in `README.md`. Read `plans/ROADMAP.md` before starting
any phase.

## Stack and shape

- Next.js 16 App Router, React 19, Tailwind 4, TypeScript, vitest. Node 22 (`.nvmrc`).
- **Fully static export** (`output: "export"`, served from `out/` on Cloudflare
  Pages). No server, no API routes, no runtime fetch of content. Anything that
  needs a server lives in `workers/` as a separate Cloudflare Worker.
- **Everything is generated on the client, deterministically from a seed.** A
  session is fully described by its URL (`/practice?type=verbs&cases=…&seed=42`,
  see `lib/session.ts`), so the same URL always produces the same questions.
- Persistence today is localStorage only (`lib/storage.ts`): last config per
  drill and lifetime accuracy per drill × case. There are no accounts yet.

## Codebase map

| Path | What it is |
| --- | --- |
| `app/page.tsx` | Home menu, built from the drill registry |
| `app/<drill>/page.tsx` | One configurator per drill (cases, pronouns, possessives, numbers, verbs, shuffle). They write the session URL |
| `app/practice/` | The runner: reads the URL, builds the session, grades, records stats |
| `components/` | `ExerciseCard` (one question, speech, keyboard), `ResultsSummary`, `ui` |
| `lib/drills.ts` | **Drill registry** (`DRILLS`, `drillFor`): route, menu text, builder, allowed cases, own URL params, shuffle mix. Single source for "which drills exist" |
| `lib/session.ts` | Config ⇄ query string. Shared params here; drill-specific ones come from the registry |
| `lib/generate.ts` | Case drill: template + fitting noun + adjective → exercise. Also `article()`, `resolvePrep()` (z/ze, w/we), `renderPrompt`, `renderSolution` |
| `lib/pronouns.ts`, `lib/possessives.ts`, `lib/agreement.ts` | Demonstrative and possessive drills, sharing the agreement frames |
| `lib/numerals.ts`, `lib/numbers.ts` | Numeral grammar, and the four number drills (count, numeral form, spelling, ordinals/dates/time) |
| `lib/verbs.ts` | Verb conjugation from principal parts, the five tenses, time frames, English verb morphology |
| `lib/shuffle.ts` | Mixes drills, using the registry's `mix` configs |
| `lib/grade.ts`, `lib/diagnose.ts`, `lib/choices.ts` | Grading (a diacritics-only miss is separate), why-you-were-wrong explanations, multiple-choice distractors |
| `lib/types.ts` | Every shared type and enum list (cases, tags, genders, levels, `Config`, `Exercise`) |
| `data/*.json` | **The lexicon**: nouns, adjectives, collocations, templates, groups, verbs, agreement/count/numeral frames. Schema and rules in `data/README.md` |
| `lib/load.ts` | Validates every JSON entry (throws naming the entry), resolves `@group` refs, and `publish()` strips drafts and every reference to them |
| `lib/lexicon.ts` | Loads the lexicon once: published, or with drafts when `NEXT_PUBLIC_INCLUDE_DRAFTS=1` |
| `lib/nouns.ts`, `adjectives.ts`, `templates.ts` | Thin modules exporting the loaded lists (`NOUNS`, `ADJECTIVES`, `COLLOCATIONS`, `TEMPLATES`) |
| `lib/review/`, `scripts/review-*.ts` | Native-speaker review flow: CSV export/import, stable JSON formatter |
| `lib/speak.ts`, `lib/speaker.ts`, `lib/ttsUrl.ts`, `lib/sound.ts` | Sentence audio (TTS Worker when `NEXT_PUBLIC_TTS_URL` is set, browser speech as fallback) and the right/wrong cues |
| `scripts/audio/` | Pre-rendered audio pipeline: `manifest` → `render` (azure / piper / cmd) → `upload` to R2 |
| `audio/manifest.jsonl` | Every sentence the published app can speak, with its R2 key. Committed; regenerate when published spoken text changes |
| `workers/tts/` | Cloudflare Worker serving audio from R2 (Azure optional). Own `package.json`, tests and README, excluded from the root tsconfig and vitest |
| `plans/` | Roadmap and per-phase specs with status (☐ ◐ ☑) |

## Rules that are easy to break

1. **Golden snapshot = what learners see.** `lib/__tests__/golden.test.ts`
   snapshots every drill's sessions for fixed seeds. A refactor must leave it
   unchanged. Update it (`npx vitest run --project published -u lib/__tests__/golden.test.ts`)
   only for an intended change to published output, and list every changed line
   in the commit message. Never run a blanket `vitest -u`.
2. **Order in `data/*.json` is part of the output.** Generators walk the lists in
   file order with a seeded RNG, so reordering entries or list items changes
   sessions. Append new entries at the end.
3. **New content is a draft.** Add it with `"review": "draft"`. Drafts never reach
   the published app; a native speaker approves them through
   `npm run review:export` → edit the CSV → `npm run review:import <csv>`.
   Approving drafts is the expected moment to update the golden snapshot and
   regenerate `audio/manifest.jsonl`. When an edit touches a *published* entry
   (exclusions, collocations, groups), it may only add draft words; anything else
   changes the live app.
4. **Only add Polish forms you are certain of.** Wrong grammar is worse than a
   missing word. Put accepted variants in `alt`. Every new noun or adjective
   needs truthful tags and collocations, because those decide which sentences it
   enters (read `data/README.md` first).
5. **Content changes need sentences read, not just tests run.** The content
   gate (`lib/__tests__/content.test.ts`) catches structure (every template has
   fitting nouns, every level fills a session, the fuzz finds no empty answers
   or duplicate options). It cannot tell "Kocham chorego psa" is odd. Generate
   sentences with a throwaway script and read them.
6. **Two vitest projects.** `published` runs everything (golden included) without
   drafts. `drafts` runs the content gate, draft-filter and frame tests with
   drafts in. Both must pass.
7. **The app's spoken text is keyed by its exact string.** If you change
   `spokenGap`, `renderPrompt` or `renderSolution`, or the normalisation in
   `workers/tts/src/text.ts` (shared by the Worker and the scripts), the R2
   cache and the manifest go stale.
8. **Static export only.** No server-side features. `NEXT_PUBLIC_*` env vars are
   inlined at build time (see `next.config.ts`).

## Commands

```bash
npm ci                  # also: cd workers/tts && npm ci, for Worker work
npm run dev             # http://localhost:3000; npm run dev:drafts shows drafts
npm test                # both vitest projects (~420 tests)
npm run lint
npm run build           # static export to out/
npx tsc --noEmit        # run AFTER a build: LayoutProps in app/layout.tsx is generated by next build
npm run review:export   # review/pending.csv for the native reviewer (git-ignored)
npm run audio:manifest  # ~90 s; commit audio/manifest.jsonl if it changed
```

Before committing, run test, lint, build, then tsc. All four must be clean.

## How to add things

- **A word or template.** Append it to the right `data/*.json` file as a draft,
  with `level` (A1–B2) and `freq` (1–5) per the rules in `data/README.md`. Then
  run `npm test` and read generated sentences.
- **A drill.** Write one builder file in `lib/`, add one entry in
  `lib/drills.ts`, add its kind to `DRILL_KINDS` and `EXERCISE_KINDS` in
  `lib/types.ts`, and add one configurator page in `app/<drill>/page.tsx`. Add a
  config for it to the golden test.
- **A noun flag or schema field.** Add it to the type in `lib/types.ts`,
  validate it in `lib/load.ts` (unknown fields are rejected), make `publish()`
  strip any draft references, document it in `data/README.md`, and show it in
  the review export (`lib/review/export.ts`).

## Known limits

- **Verbs.** One-off actions can land in "codziennie / cały dzień" frames
  ("codziennie będziemy wynajmować mieszkanie"), and a few imperatives are odd.
  Frames can't be restricted per verb beyond the `momentary`, `stative`,
  `indeterminate` and `motion` flags.
- **Adjectives** can't be limited to some templates or one number (no "ulubiony
  only in the singular").
- **ze before w + consonant** ("ze wszystkimi") is not generated. It is waiting
  for a native speaker's call.
- **Draft data ships in the JS bundle**, unused. It's harmless, but unreviewed
  words are visible to anyone who reads the bundle.
- **Pre-rendered audio covers the spelling drill up to 1000.** Above that the
  app falls back to Azure or the browser voice.

## Current status

See `plans/ROADMAP.md`.

- **Phase 0 and Phase 1 code are done.** The lexicon is 306 nouns, 150
  adjectives, 139 verbs and 319 templates.
- **Waiting on the user:**
  - native review of the drafts (`review:export`, about 540 rows);
  - audio rendering and upload (`audio:render`, `audio:upload`);
  - deploying `workers/tts`.
- **Next is Phase 2 (retention).** The brief is in `plans/phase-2.md`.
