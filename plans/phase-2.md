# Phase 2: Retention

Status: ◐ spec written, implementation in progress.

## Goal

Give learners a reason to come back every day. Before Phase 2 the app was
configure → drill → leave, and progress was a per-case percentage. Phase 2 adds:

1. **Per-item stats** (an answer log keyed by card) in place of the per-case counts.
2. **Spaced repetition (SRS)** on top of that log.
3. **"Today's practice"**: one button on the home page that builds a session from
   what is due, with no configurator in the way.
4. **Streak, daily goal and a weak-spots view**, fed by the skill stats and the
   diagnosis engine.

## Decisions

### 1. The card unit

A **card** is *skill × word*: the smallest thing worth scheduling on its own.
A card id is a plain string built only from lemmas and enum values, never from
device-local ids or template text, so Phase 4 can sync it as is. Every id starts
with its drill.

| Drill | Card id | Skill (weak-spots group) |
| --- | --- | --- |
| cases | `cases:<noun lemma>\|<case>\|<sg\|pl>` | `cases:<case>\|<sg\|pl>` |
| pronouns | `pronouns:<case>\|<gender>\|<sg\|pl>` (gender = mPers / mAnim / mInanim / f / n) | `pronouns:<case>\|<sg\|pl>` |
| possessives | `possessives:<owner>\|<case>\|<gender>\|<sg\|pl>` (owner from `POSSESSIVES`) | `possessives:<case>\|<sg\|pl>` |
| numbers | `numbers:<drill>\|<facet…>`: the 1 / 2–4 / 5+ band and case for `count`, the numeral class and case for `numeral`, the magnitude for `spell`, date / time / ordinal and case for `ordinal` (exact facets: `lib/cards/numbers.ts`) | `numbers:<drill>\|<band or class>` |
| verbs | `verbs:<infinitive>\|<tense>` (the infinitive as stored, `się` included) | `verbs:<tense>\|<person>` |

- Pronouns and possessives schedule the *paradigm cell*, not the noun: the noun
  is only a carrier there.
- Adjectives get no cards of their own in Phase 2. An adjective rides along with
  its noun card in `mode: "both"` sessions (A2 and up), and its misses still show
  in the weak-spots view through the diagnosis.
- **Every exercise carries `card` and `skill`**, whichever entry point built it
  (configured sessions too), so every answer anywhere feeds the SRS. The golden
  test strips both fields, like it strips lexicon metadata from `source`.

### 2. How a drill exposes its cards

Each drill has a `CardSource` (`lib/cards.ts`, one file per drill under
`lib/cards/`), reached as `DRILLS[kind].cards`:

```ts
type CardSource = {
  /** Every published card, at maxLevel or below, in introduction order. */
  all(maxLevel?: Level): CardInfo[];
  /** One exercise for exactly this card, or null when it can no longer be built. */
  build(card: string, seed: number, answerMode?: AnswerMode): Exercise | null;
  /** "Instrumental plural", "Past tense, 3rd person plural"… */
  skillLabel(skill: string): string;
};
type CardInfo = { id: string; skill: string; level: Level; freq: Freq };
```

- `build` is a **new entry point**: existing `(config, seed)` builders keep their
  output byte for byte (golden test). It may add optional parameters to internal
  helpers, never change what existing calls produce.
- A card's `level` is the higher of its word's level and the lowest level of a
  frame that can drill it; `freq` is the word's (3 when the card has no word).
- A card whose word was removed or became a draft returns `null` from `build`
  and is skipped. After a review batch is approved, new cards simply appear in
  `all()`.

### 3. Scheduler: SM-2 with three grades

FSRS needs more history than a beta will have; SM-2 is predictable and easy to
test. Per card: `{ due, interval, ease, reps, lapses, last }` (times in ms since
epoch, `interval` in days).

| Verdict | Effect |
| --- | --- |
| `correct` | reps+1; interval 1 → 3 → `round(interval × ease)`; ease +0.05 (max 3.0) |
| `diacritics` | counts as a pass; interval `max(1, round(interval × 1.2))`; ease −0.05 |
| `wrong` | lapses+1, reps 0; interval 0, due in 10 minutes; ease −0.2 (min 1.3) |

- `due = start of local day(answer time) + interval days` for passes, so a card
  becomes due at midnight, not at the hour it was answered.
- A wrong card in today's session is re-asked once at the end of the session.
- Response time is not used in Phase 2.

### 4. Storage: an append-only log plus a derived cache

localStorage, schema `v2`:

| Key | Content |
| --- | --- |
| `polish.log.v2` | `AnswerEvent[]`, append-only: `{ t, card, skill, verdict, miss? }`. `t` is ms since epoch, `miss` a `MissKind` |
| `polish.progress.v2` | Derived cache: card states, per-skill counts and miss tallies, per-day counts, per-drill × case counts, rebuilt by replaying the log |
| `polish.settings.v2` | `{ goal, newPerDay }` |

- **Replay is the source of truth**: `replay(events)` must reproduce the cache
  exactly (tested). Phase 4 syncs the log, merges by `(t, card)` and replays.
- The log is compacted when it passes 20,000 events: the oldest are folded into
  a `base` snapshot inside the cache, so replay = base + remaining events.
- **Migration from v1:** the per-case counts in `polish.stats.<kind>.v1` are
  copied once into the v2 per-drill × case counts (flag `migrated: true`), so the
  configurator percentages carry over. v1 keys are left in place.
- Reads keep the `useSyncExternalStore` cache pattern of `lib/storage.ts`, safe
  when storage is unavailable.

### 5. New cards each day

- `newPerDay` default 10. New cards come from `all()` of every drill, filtered to
  the learner's level cap, sorted by **level, then freq, then drill round robin,
  then file order**, so a first session is A1 everyday words across drills.
- The daily level cap starts at A1 and opens the next level once 80% of the
  current level's cards have been seen at least once with ≥ 70% accuracy.

### 6. Today's practice

`buildToday(state, now, seed, opts) → Exercise[]` is pure (state snapshot + date +
seed → the same session). Seed defaults to a hash of the local date.

- Size: the daily goal (default 20).
- Order of selection: due reviews, most overdue first (at most 70% of the
  session when new cards are available), then new cards up to what is left of
  `newPerDay`, then filler.
- **When nothing is due and the new-card budget is spent:** the home button
  reads "Extra practice" and builds the session from the weakest skills (lowest
  accuracy, ≥ 5 answers), then from the cards due soonest.
- Interleaved so the same drill rarely comes twice in a row.
- Route `/today`: no URL config, the session comes from storage. The runner is
  shared with `/practice`.

### 7. Daily goal and streak

- Goal unit: **questions answered** (10 / 20 / 40, default 20). Minutes are
  unreliable across tabs and devices.
- A day is the learner's **local calendar day** (`YYYY-MM-DD` in the device time
  zone, computed at answer time and stored with the day counts).
- A day counts toward the streak when the goal is met. **One grace day:** a
  single missed day does not break the streak (it does not add to it), at most
  once in any 7 days.

### 8. Progress and weak spots

- Route `/progress`: streak, today's goal ring, the last 28 days, and weak spots.
- Weak spots = skills with ≥ 5 answers and the lowest accuracy over the last 30
  days, labelled by the drill's `skillLabel` ("Instrumental plural"), plus the
  most frequent miss kinds from `lib/diagnose.ts` (`diagnoseMiss`), e.g. "wrong
  gender ending on the adjective", "accusative of an animate masculine". Each weak
  spot links to a configured session that drills it.
- The configurator per-case percentages stay, derived from the v2 per-drill × case
  counts.

## Work split

| # | Piece | Files |
| --- | --- | --- |
| A | Card sources: cases, pronouns, possessives; `diagnoseMiss` | `lib/cards/{cases,pronouns,possessives}.ts`, `lib/generate.ts`, `lib/pronouns.ts`, `lib/possessives.ts`, `lib/agreement.ts`, `lib/diagnose.ts` |
| B | Card source: numbers | `lib/cards/numbers.ts`, `lib/numbers.ts` |
| C | Card source: verbs | `lib/cards/verbs.ts`, `lib/verbs.ts` |
| D | Scheduler, log, progress, today builder | `lib/srs.ts`, `lib/progress.ts`, `lib/today.ts` |
| E | UI: home button, `/today`, `/progress`, recording, settings | `app/`, `components/`, `lib/storage.ts` |

## Done when

- [ ] A first-time learner can press one button and get a sensible session.
- [ ] Returning the next day shows due items first.
- [ ] The streak and goal persist across reloads.
- [ ] The weak-spots view names concrete patterns.
- [ ] All gates are green and the golden snapshot is unchanged.
