# Roadmap: from side project to paid product

Goal: sell PolishUp (polishup.app), first as a web app (PWA) and then in the iOS and Android
stores. Content comes first: a paying learner who meets the same 125 nouns after
a week will cancel, however polished the rest of the app is.

Status key: ☐ todo · ◐ in progress · ☑ done

| Phase | Theme | Size | Status |
| --- | --- | --- | --- |
| 0 | Groundwork: registry, data files, levels, content gate | ~1 week | ☑ — see [phase-0.md](./phase-0.md) |
| 1 | Content ×2–4 and natural audio | 3–5 weeks | ◐ code done; waiting on native review + audio render — see [phase-1.md](./phase-1.md) |
| 2 | Retention: SRS, "today's practice", streaks | 2–3 weeks | ☑ code done; tune in the Phase 3 beta — see [phase-2.md](./phase-2.md) |
| 3 | Ship the web app: PWA, brand, landing page, beta | 1–2 weeks | ☑ live at polishup.app; beta running — see [phase-3.md](./phase-3.md) |
| 4 | Accounts, sync, payments | ~2 weeks | ☐ |
| 5 | Mobile apps (Capacitor) | ~2 weeks | ☐ |

**Critical path:** the native-speaker review of the Phase 1 drafts
(`npm run review:export` → `review/pending.csv`, about 540 rows). It is the only
step that cannot be automated. Phase 2 can be built in parallel, because drafts
never reach the published app.

New to the codebase? Start with `AGENTS.md`, which covers the map, the rules
and the commands.

---

## Phase 0: Groundwork

Changes that make content cheap to add. Full spec: [phase-0.md](./phase-0.md).

- 0.1 Drill registry: one `DRILLS` map replaces the `kind === …` chains.
- 0.2 Lexicon moves out of TypeScript into JSON files under `data/`.
- 0.3 Every lexicon entry and template gets a CEFR `level` (A1–B2).
- 0.4 The lexicon tests become a content gate for bulk imports.

## Phase 1: Content and audio (top priority)

### 1a. Lexicon at scale

| | Phase 0 | Launch target | Now (incl. drafts) |
| --- | --- | --- | --- |
| Nouns | 125 | 300 | 306 |
| Adjectives | 74 | 150 | 150 |
| Verbs | 32 pairs | 120 | 139 (some imperfective-only) |
| Case templates | 142 | 300 | 319 |

- Source paradigms from a morphological dictionary (SGJP / Morfeusz), and check
  its licence before shipping. Avoid Wiktionary as the bulk source: it is
  CC BY-SA, and share-alike would bind the app's data.
- An LLM drafts templates, glosses and semantic tags. A native speaker reviews
  every new template before it merges.
- Order: frequency-ranked A1–A2 first, then B1.
- Write an import script (`scripts/import-*.ts`) so bulk additions go through
  the Phase 0.4 content gate, never by hand-editing hundreds of entries.

### 1b. Audio

- Built: the sentence set turned out to be finite (~55k strings), so every
  sentence is pre-rendered (`scripts/audio/`, engines azure / piper / cmd) and
  served from R2 by `workers/tts/`, with Azure as an optional fallback.
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
- A shared configurator component for the six drill configurator pages; with it,
  a real page title for each (they are client components and keep the site's
  default title today).
- `lang="pl"` on Polish words inside English prose (landing page, drill blurbs)
  for screen readers and TTS; the guide pages already use `<Pl>`.
- `/billing`: a price and Pro feature list once Phase 4 decides them.
- **Reminders**, opt-in, for the streak and due reviews: web push notifications
  through the service worker (on iPhone only for the installed app, iOS 16.4+), and
  email reminders once Phase 4 has accounts and an address to send to.
- **An install popup**: after a learner's first finished session (never on the
  first visit), a dismissible card offering to add the app to the home screen.
  It reuses `lib/install.ts` (the browser prompt, or Safari's steps on iPhone).
