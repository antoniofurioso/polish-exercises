# Phase 2: Retention (brief)

Status: ☐ not started. This is the starting brief for the chat that designs and
builds Phase 2. Write the detailed spec here first, then implement.

## Goal

Give learners a reason to come back every day. Today the app is configure → drill →
leave, and progress is a per-case percentage. Phase 2 adds:

1. **Per-item stats** in place of the per-case counts.
2. **Spaced repetition (SRS)** on top of those stats.
3. **"Today's practice"**: one button on the home page that builds a session from
   what is due, with no configurator in the way.
4. **Streak, daily goal and a weak-spots view** fed by the diagnosis engine.

## What exists to build on

- **Stats today:** `lib/storage.ts`. localStorage keys `polish.stats.<kind>.v1`
  hold `Partial<Record<Case, {correct, total}>>` per drill. `recordAnswer(kind, case, correct)`
  is called once per answer from `app/practice/PracticeClient.tsx`. The
  configurator pages show these numbers through `useStoredStats`. Reads go
  through a `useSyncExternalStore` cache that is safe when storage is
  unavailable; keep that pattern.
- **Exercise identity:** `Exercise.id` is unique per *sentence*, so it is too
  fine-grained to be an SRS card:
  - cases: `template|lemma|adj|number|case`
  - verbs: `tense|inf|subject|object|frame`
  - numbers: `count|n|lemma|template`, `spell|n`, …
  
  The SRS card should be the *skill × word* instead, for example
  noun lemma × case × number, adjective × case × gender/number, verb ×
  tense × person, numeral rule × range. Deciding that unit is the first design
  question. `Exercise.source` carries the noun and adjective for the case drill;
  the other drills need equivalent metadata added to `Exercise`.
- **Diagnosis:** `lib/diagnose.ts` `explainMiss(input, exercise)` explains a
  wrong answer, e.g. a wrong case or a wrong gender ending. Its categories are
  the natural input for a weak-spots view ("you keep missing the instrumental
  plural").
- **Building sessions:** every drill builder is `(config, seed) => Exercise[]`
  and is reached through `DRILLS[kind].build` (`lib/drills.ts`). `Config`
  already has `maxLevel`. "Today's practice" needs a way to ask a builder for
  specific items, e.g. a filter or "targets" field on `Config`, or a new
  builder entry point. That entry point must not change the output of existing
  configs; the golden test enforces this.
- **Shuffle:** `lib/shuffle.ts` already mixes drills into one session. It is a
  good model for a mixed daily session.
- **Levels:** every word and template has `level` (A1–B2) and `freq`. Use them
  to introduce new items in a sensible order.

## Constraints

- **Static export, client-only.** All state is in localStorage for now. Design
  the record format so Phase 4 can sync it to Cloudflare D1:
  - append-friendly;
  - per-item timestamps;
  - a schema version in the key (`.v1` → `.v2`, with a migration from the
    per-case stats);
  - no dependence on device-local ids.
- **Determinism.** A daily session must be reproducible from its inputs
  (state snapshot + date + seed), or at least testable that way.
- **Published content only.** Drafts never appear (`lib/lexicon.ts`). After a
  review batch is approved, new items should simply start appearing.
- **The golden snapshot must stay unchanged** for existing configs. New entry
  points get their own tests.
- **Read `AGENTS.md`** for the repo rules (drafts, data order, commands, checking
  with tsc after a build).

## Open decisions for the Phase 2 chat

1. The card unit for each drill (see above).
2. Scheduler: SM-2 or FSRS-style. Grading inputs are correct, diacritics-only
   miss and wrong (`lib/grade.ts` `Verdict`), plus response time if it is useful.
3. How new cards are introduced each day (by level, then `freq`?) against reviews.
4. Daily goal unit (questions or minutes) and streak rules (time zone, grace day).
5. What "Today's practice" shows when nothing is due.
6. Whether the per-case percentages on the configurator pages stay, or are
   derived from the new stats.

## Done when

- A first-time learner can press one button and get a sensible session.
- Returning the next day shows due items first.
- The streak and goal persist across reloads.
- The weak-spots view names concrete patterns.
- All gates are green and the golden snapshot is unchanged.
