# Phase 0: Groundwork

Make content cheap to add before Phase 1 multiplies it. No user-visible change.

## Safety net (already in place)

`lib/__tests__/golden.test.ts` snapshots every drill's sessions for fixed seeds
(typing and multiple choice) plus the session URLs. Every Phase 0 task must keep
it green **without updating the snapshot**: these are refactors, the generated
sentences must not change. The snapshot strips lexicon entries down to their
lemma, so adding metadata fields (0.3) does not count as a change.

Checks for every task: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Work split

0.1 and 0.2 touch different files and run in parallel. 0.3 and 0.4 build on the
data files from 0.2, so they run after it merges.

```
0.1 registry ─────────────┐
                          ├─► merge ─► 0.3 levels + 0.4 content gate ─► merge
0.2 data files ───────────┘
```

### 0.1 Drill registry ☑

**Problem.** Adding a drill means editing a chain of `kind === …` checks in
`lib/session.ts` (`sessionParams`, `parseSession`),
`app/practice/PracticeClient.tsx` (`Runner`) and the menu in `app/page.tsx`.

**Do.**
- New `lib/drills.ts` exporting one `DRILLS` registry keyed by `ExerciseKind`:
  route, titles and blurb for the menu, the session builder, the cases a URL
  may name, and the drill's own URL params (serialise / parse hooks for
  `demo`, `own`, `drills`, `max`, `tenses`, `vt`, `mix`).
- `sessionParams`, `parseSession`, `Runner` and the home menu read from it.
- `lib/shuffle.ts` takes its builders from the registry too.

**Don't.** Touch the configurator pages beyond imports, or the lexicon files.

**Done when.** Adding a drill is: one builder file, one registry entry, one
configurator page. Golden test unchanged.

### 0.2 Lexicon into data files ☑

**Problem.** Nouns, adjectives, templates and verbs live in TypeScript, so only
someone editing code can add content, and no script can generate it.

**Do.**
- Move the data to `data/nouns.json`, `data/adjectives.json`,
  `data/templates.json`, `data/verbs.json` (plus `data/collocations.json` if
  `COLLOCATIONS` is data). Statically imported (`resolveJsonModule` is on), so
  the static export and offline use keep working with no fetch.
- Values computed in TS today (e.g. `RELATIVES` in `lib/templates.ts`, derived
  from noun tags) become named groups referenced from JSON (e.g.
  `"excludeLemmas": ["@relatives", "list"]`) and are resolved by the loader.
- `lib/nouns.ts` etc. keep exporting `NOUNS`, `ADJECTIVES`, `TEMPLATES`, `VERBS`
  with the same types, so no consumer changes.
- Loader validation: a small hand-written check that throws on a malformed
  entry with the entry's lemma in the message. No new dependency.
- A plain readable layout, one entry per object; nouns keep the 7-case row
  order documented in the file's README.
- `data/README.md`: the schema of each file and how to add an entry.

**Don't.** Move grammar logic (paradigm tables for pronouns, possessives,
numerals; verb frames and conjugation) — only the lexicon.

**Done when.** Every lexicon entry lives in `data/*.json`; golden test unchanged.

### 0.3 CEFR levels ☑

- Add `level: "A1" | "A2" | "B1" | "B2"` to every noun, adjective, verb and
  template, and `freq?: 1 | 2 | 3 | 4 | 5` (1 = most common) to the lexicon.
- Assign by judgment for now, and mark it as such in `data/README.md`:
  Phase 1 replaces `freq` with corpus data (NKJP frequency lists) and the native
  speaker reviews levels.
- Add `maxLevel?: Level` to `Config` and filter the lexicon by it in the
  builders, with no UI yet. When it is omitted, output must be identical
  (golden test unchanged).

### 0.4 Content gate ☑

Extend `lib/__tests__/lexicon.test.ts` (done as `lib/__tests__/content.test.ts`) so a
bulk import cannot break the generator:
- every JSON entry passes the loader's validation;
- no duplicate lemmas across a file; every lemma a template names exists;
- every template has at least 3 fitting nouns overall, and at least 1 at its
  own level or below;
- every level, A1 upward, can fill a 20-question session in each drill;
- fuzz: 200 random seeds per drill at each `maxLevel` produce no empty
  answers, no unresolved `{…}` slots and no duplicate multiple-choice options.

## Out of scope

UI changes, new content, backend. Those are Phases 1–5 in [ROADMAP.md](./ROADMAP.md).
