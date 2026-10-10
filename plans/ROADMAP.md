# Roadmap: from side project to paid product

Goal: sell PolishUp (polishup.app), first as a web app (PWA) and then in the iOS and Android
stores. Content comes first: a paying learner who meets the same 125 nouns after
a week will cancel, however polished the rest of the app is.

Status key: ☐ todo · ◐ in progress · ☑ done

| Phase | Theme | Size | Status |
| --- | --- | --- | --- |
| 0 | Groundwork: registry, data files, levels, content gate | ~1 week | ☑ — see [phase-0.md](./phase-0.md) |
| 1 | Content ×2–4 and natural audio | 3–5 weeks | ◐ code done; waiting on native review; audio engine chosen, render deferred — see [phase-1.md](./phase-1.md) |
| 2 | Retention: SRS, "today's practice", streaks | 2–3 weeks | ☑ code done; tune in the Phase 3 beta — see [phase-2.md](./phase-2.md) |
| 3 | Ship the web app: PWA, brand, landing page, beta | 1–2 weeks | ☑ live at polishup.app; beta running — see [phase-3.md](./phase-3.md) |
| 4 | Accounts, sync, payments | ~2 weeks | ◐ spec written, build started — see [phase-4.md](./phase-4.md) |
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
- Engine chosen: **Chatterbox Multilingual** (MIT), with a CC0 reference voice.
  No Piper Polish voice is licensed for commercial use. Render deferred until
  real learners arrive and the native review is in. Details:
  [phase-1.md](./phase-1.md) §1.5b.

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

Full spec: [phase-4.md](./phase-4.md).

- Auth and progress sync on Cloudflare Workers + D1 (`workers/api`, free plan).
  Sign-in by email only: a 6-digit code typed in the app; no Google for now.
- Payments: Stripe Managed Payments (Stripe is merchant of record and handles
  VAT) on the owner's existing account.
- Beta: while `BETA_OPEN` is on, every new account gets Pro free, for good. The
  owner closes it later; existing beta accounts keep Pro.
- After the beta: no free plan. A 3-day free trial, card required, landing on
  `/today`, with a reminder email on day 2. The guides and the landing sample
  stay free.
- Prices:

  | Plan | EUR | USD | PLN |
  | --- | --- | --- | --- |
  | Monthly | €6.99 | $7.99 | 29.99 zł |
  | Annual (default) | €49 | $54.99 | 199 zł |
  | Lifetime (limited-time offer) | €99 | $109 | 399 zł |

  Raise prices later for new users only.
- Email list in Resend, one segment per plan, kept in step by the Worker;
  marketing email only with opt-in.

## Phase 5: Mobile

- Wrap `out/` with Capacitor; native TTS plugin as the offline fallback.
- RevenueCat for in-app purchases, shared entitlements with the web.
- iOS and Android store listings.

## Later

- **Reminders**, opt-in, for the streak and due reviews: web push notifications
  through the service worker (on iPhone only for the installed app, iOS 16.4+), and
  email reminders once Phase 4 has accounts and an address to send to.

### Done from Later

- ☑ Shared configurator (`components/Configurator.tsx`) for the six drill pages,
  each now a server `page.tsx` with its own `<title>`.
- ☑ `lang="pl"` on Polish words in drill blurbs (`*…*` marks + `PlText`); the
  landing page and guides were already marked.
- ☑ Install card on the results screen (`components/InstallCard.tsx`), on the
  learner's 2nd, 7th and 15th practice day while not installed; closing it
  hides it until the next of those days.
- ☑ Resume today's practice: the day's session is saved in `polish.today.v1`
  and continues from the next unanswered question; a finished or stale save is
  ignored.
