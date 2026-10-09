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

## Keep the docs current: part of every change

Updating the documentation is part of the work, not a follow-up. A change is not
done until the docs it affects are updated **in the same commit**. Before
committing, check this table:

| If you changed… | Update |
| --- | --- |
| A file's role, a new module or folder, a new script | The codebase map below, and the file table in `README.md` |
| A rule, a gotcha, a command, how tests are split | "Rules that are easy to break" / "Commands" below |
| A data field, flag, group or file in `data/` | `data/README.md` (schema and rules), and `lib/review/export.ts` if reviewers should see it |
| A drill, URL param or user-visible behaviour | `README.md` (routes, features), and "How to add things" below if the process changed |
| Audio pipeline, Worker or env vars | The `README.md` "Audio" section and `workers/tts/README.md` |
| Progress on a phase | That phase's `plans/phase-N.md` (☐ ◐ ☑ and what is left) and the status table in `plans/ROADMAP.md` |
| Lexicon counts, known limits, overall status | "Known limits" / "Current status" below |

Write for the next session, which starts with no memory of this one. State
facts and current numbers, not history ("306 nouns", not "added 181 nouns").
Delete anything the change made untrue.

## Stack and shape

- Next.js 16 App Router, React 19, Tailwind 4, TypeScript, vitest. Node 22 (`.nvmrc`).
- **Fully static export** (`output: "export"`, served from `out/` on Cloudflare
  Pages). No server, no API routes, no runtime fetch of content. Anything that
  needs a server lives in `workers/` as a separate Cloudflare Worker.
- **Everything is generated on the client, deterministically from a seed.** A
  session is fully described by its URL (`/practice?type=verbs&cases=…&seed=42`,
  see `lib/session.ts`), so the same URL always produces the same questions.
- Persistence is localStorage only (`lib/storage.ts`): last config per drill,
  and schema v2 (`polish.log.v2` answer log, `polish.progress.v2` cache derived
  from it by replay, `polish.settings.v2` goal and new cards per day). v1
  per-case stats are migrated once and left in place. There are no accounts yet.
  Every call from `lib/storage.ts` into the progress logic is wrapped so a throw
  never stops practice: the log is written first and a stale cache is dropped
  and rebuilt by replay on the next load.

## Codebase map

| Path | What it is |
| --- | --- |
| `app/page.tsx` | Home: the "Today's practice" button (`components/TodayButton`), then the drill menu from the registry |
| `app/today/` | Today's practice: `buildToday` on a progress snapshot taken at mount, run by the shared `Runner`; a wrong card is asked once more at the end |
| `app/progress/` | Streak, today's goal ring, the last 28 days, weak spots (each linking to a configured `/practice` session) and the goal / new-per-day settings |
| `app/<drill>/page.tsx` | One configurator per drill (cases, pronouns, possessives, numbers, verbs, shuffle). They write the session URL |
| `app/practice/` | Reads the URL, builds the session and hands it to `Runner` |
| `components/` | `Runner` (runs a prebuilt `Exercise[]`, grades, records every answer; shared by `/practice` and `/today`), `ExerciseCard` (one question, speech, keyboard), `ResultsSummary`, `TodayButton`, `today` (`useTodayStatus`, `useNow`, `GoalRing`, `GoalStatus`), `ui` |
| `lib/storage.ts` | localStorage: configs, sound, the v2 log / progress / settings hooks (`useProgress`, `useSettings`, `recordAnswer`…), v1 migration, compaction past 20,000 events |
| `lib/progressView.ts` | Pure helpers for the progress UI: `MISS_LABELS` (miss kind → English), `skillConfig` / `skillHref` (weak skill → configured session), `lastDays`, `dueCount`, `safely` |
| `lib/missKind.ts` | `missKindOf(input, exercise)`: the `MissKind` logged with a wrong answer (`diagnoseVerbMiss` for verbs, `diagnoseNumberMiss` for numbers, then `diagnoseMiss`) |
| `lib/drills.ts` | **Drill registry** (`DRILLS`, `drillFor`): route, menu text, builder, allowed cases, own URL params, shuffle mix. Single source for "which drills exist" |
| `lib/cards.ts`, `lib/cards/<drill>.ts` | **SRS card sources** (`CardSource`, reached as `DRILLS[kind].cards`): `all(maxLevel)` in introduction order, `build(card, seed)` for one card, `skillLabel`. Card ids per drill: `plans/phase-2.md` §1. Cases build through `buildCardExercise` in `lib/generate.ts`; pronouns and possessives through their builders' `gender` filter, levelled by `cellLevel` in `lib/agreement.ts` |
| `lib/session.ts` | Config ⇄ query string. Shared params here; drill-specific ones come from the registry |
| `lib/generate.ts` | Case drill: template + fitting noun + adjective → exercise. Also `article()`, `resolvePrep()` (z/ze, w/we), `renderPrompt`, `renderSolution` |
| `lib/pronouns.ts`, `lib/possessives.ts`, `lib/agreement.ts` | Demonstrative and possessive drills, sharing the agreement frames |
| `lib/numerals.ts`, `lib/numbers.ts` | Numeral grammar, and the four number drills (count, numeral form, spelling, ordinals/dates/time). `numbers.ts` also tags each exercise with its SRS card and builds one exercise per card (`buildNumberCard`) |
| `lib/diagnoseNumbers.ts` | `diagnoseNumberMiss(input, exercise)`: the `MissKind` of a wrong numbers answer, from its card: `government` (counted noun in the wrong form), `numeralForm` (numeral or ordinal in the wrong gender / case), `typo`, `ending`, `wordCount`, `empty`; null leaves it to `diagnoseMiss` |
| `lib/cards/numbers.ts` | The numbers `CardSource` (Phase 2): card id scheme, levels, introduction order, skill labels |
| `lib/verbs.ts` | Verb conjugation from principal parts, the five tenses, time frames, English verb morphology. Also the verbs card / skill ids stamped on every exercise, `buildVerbCard` (one exercise for one verb × tense) and `diagnoseVerbMiss` (aspect, pastGender, person, tense; a gender slip only when person and number are right) |
| `lib/cards/verbs.ts` | Verbs `CardSource`: one card per drillable verb × tense, `TENSE_LEVEL` (present A1, the rest A2), `skillLabel` |
| `lib/shuffle.ts` | Mixes drills, using the registry's `mix` configs |
| `lib/srs.ts` | SM-2 scheduler with three grades (`schedule`: 1 → 3 → interval × ease days, due at local midnight; wrong → 10 min), and the local-day helpers (`dayKey`, `startOfDay`, `dayNumber`, `addDays`) |
| `lib/progress.ts` | Progress v2, pure: answer log → cache (`apply`, `replay`, `compact` into `base`, `migrateV1`), streak with grace day, `weakSpots`, `levelCap`, `todayCount`, `dueCards`, `introducedToday`. Card sources are injectable (`Sources`); storage lives in `lib/storage.ts` |
| `lib/today.ts` | `buildToday`: today's session from due reviews (≤ 70% while new cards exist), new cards (by level, drills taking turns, no word or skill twice in a row) within the daily budget, then weakest-skill / soonest-due filler, then more new cards up to the goal; interleaved by drill; `daySeed`, `cardSeed` |
| `lib/grade.ts`, `lib/diagnose.ts`, `lib/choices.ts` | Grading (a diacritics-only miss is separate), why-you-were-wrong explanations (`explainMiss`) and their `MissKind` (`diagnoseMiss`), multiple-choice distractors |
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
   Every exercise must carry `card` and `skill` (the golden test strips both);
   a card's `build` is a separate path with its own RNG draws, so filters added
   for it to shared builders must not change what a `(config, seed)` call draws.
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
npm test                # both vitest projects (~500 tests)
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
- **No collective numerals** (dwoje, pięcioro). Nouns that need them (the
  `@collective` group: dziecko) are kept out of the count and numeral drills
  altogether, "jedno dziecko" included.
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
- **Phase 2 (retention) code is done:** SRS cards for every drill, the v2
  answer log, `/today` and `/progress`. Spec, decisions and open points are in
  `plans/phase-2.md`.
- **Next is Phase 3** (PWA, brand, landing page, beta).
