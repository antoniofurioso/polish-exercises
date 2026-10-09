# Roadmap: from side project to paid product

Goal: sell Ćwiczenia, first as a web app (PWA) and then in the iOS and Android
stores. Content comes first: a paying learner who meets the same 125 nouns after
a week will cancel, however polished the rest of the app is.

Status key: ☐ todo · ◐ in progress · ☑ done

| Phase | Theme | Size | Status |
| --- | --- | --- | --- |
| 0 | Groundwork: registry, data files, levels, content gate | ~1 week | ☑ — see [phase-0.md](./phase-0.md) |
| 1 | Content ×2–4 and natural audio | 3–5 weeks | ☐ |
| 2 | Retention: SRS, "today's practice", streaks | 2–3 weeks | ☐ |
| 3 | Ship the web app: PWA, brand, landing page, beta | 1–2 weeks | ☐ |
| 4 | Accounts, sync, payments | ~2 weeks | ☐ |
| 5 | Mobile apps (Capacitor) | ~2 weeks | ☐ |

**Critical path:** the native-speaker review in Phase 1a. It is the slowest step
and the only one that cannot be automated, so find the reviewer during Phase 0.

---

## Phase 0: Groundwork

Changes that make content cheap to add. Full spec: [phase-0.md](./phase-0.md).

- 0.1 Drill registry: one `DRILLS` map replaces the `kind === …` chains.
- 0.2 Lexicon moves out of TypeScript into JSON files under `data/`.
- 0.3 Every lexicon entry and template gets a CEFR `level` (A1–B2).
- 0.4 The lexicon tests become a content gate for bulk imports.

## Phase 1: Content and audio (top priority)

### 1a. Lexicon at scale

| | Today | Launch target |
| --- | --- | --- |
| Nouns | 125 | 300 |
| Adjectives | 74 | 150 |
| Verb pairs | ~32 | 120 |
| Case templates | 142 | 300 |

- Source paradigms from a morphological dictionary (SGJP / Morfeusz), and check
  its licence before shipping. Avoid Wiktionary as the bulk source: it is
  CC BY-SA, and share-alike would bind the app's data.
- An LLM drafts templates, glosses and semantic tags. A native speaker reviews
  every new template before it merges.
- Order: frequency-ranked A1–A2 first, then B1.
- Write an import script (`scripts/import-*.ts`) so bulk additions go through
  the Phase 0.4 content gate, never by hand-editing hundreds of entries.

### 1b. Audio

- Sentences are combinatorial, so they can't all be pre-recorded. A Cloudflare
  Worker calls a neural pl-PL TTS voice (Azure or Google) and caches the mp3 in
  R2, keyed by a hash of the text. Each sentence is paid for once.
- `lib/speak.ts` (browser `speechSynthesis`) stays as the offline fallback.
- First backend piece: standalone, no accounts.

**Done when:** about 4× the content, all native-reviewed, CI green, and natural
audio on every device.

## Phase 2: Retention

- Per-item stats (lemma + form + timestamp) replace the per-case counts in
  `lib/storage.ts`. Design the schema with Phase 4 sync in mind.
- An SRS scheduler on top of those stats.
- "Today's practice": one button on the home page, no configurator in the way.
- Streak, daily goal, and a weak-spots view fed by `lib/diagnose.ts`.

## Phase 3: Ship the web version

- PWA: manifest, icons, offline service worker.
- Brand: replace the create-next-app assets in `public/` and `app/favicon.ico`.
- Landing page, privacy policy, Plausible or PostHog.
- Beta with 20–30 learners (r/learnpolish, expat groups in Poland). Measure
  day-7 return before building payments.

## Phase 4: Accounts and money

- Auth and progress sync on Cloudflare Workers + D1, next to the audio Worker.
- Lemon Squeezy or Paddle as merchant of record, so they handle EU VAT.
- Freemium: A1 content and one drill free; all levels, SRS, audio and stats paid.
  The `level` field from Phase 0.3 is what the paywall filters on.

## Phase 5: Mobile

- Wrap `out/` with Capacitor; native TTS plugin as the offline fallback.
- RevenueCat for in-app purchases, shared entitlements with the web.
- iOS and Android store listings.

## Later

- Interface translations: Ukrainian and Italian.
- A shared configurator component for the six `app/*/page.tsx` pages.
- `lang="pl"` on Polish sentences for screen readers and TTS.
