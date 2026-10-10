<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# PolishUp: project guide for agents

PolishUp (polishup.app) is a Polish grammar drill app (fill-in-the-blank, with English translation and the
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
  per-case stats are migrated once and left in place.
  Every call from `lib/storage.ts` into the progress logic is wrapped so a throw
  never stops practice: the log is written first and a stale cache is dropped
  and rebuilt by replay on the next load.
- **Accounts (Phase 4) exist only when `NEXT_PUBLIC_API_URL` is set** at build
  time: sign-in with an email code, sync of the log / settings / profile name,
  and the paywall, all against `workers/api` (Worker + D1, Stripe Managed
  Payments, Resend). The token goes in `Authorization: Bearer`, never a cookie.
  Unset (dev, tests, current production), the app behaves as before.

## Codebase map

| Path | What it is |
| --- | --- |
| `app/globals.css`, `DESIGN.md` | **The design system**: colour tokens (light, dark, and a `data-theme` override), the Tailwind mapping and the shared component classes (`.btn`, `.card`, `.chip`, `.seg`, `.switch`, `.meter`…). `DESIGN.md` documents them. Pages use these, never raw hex colours |
| `app/layout.tsx` | Root layout: Inter + Source Serif 4 fonts, the before-paint theme script (`lib/theme.ts`), service worker, analytics |
| `app/(site)/` | Public pages with `SiteHeader` + `SiteFooter` (its `layout.tsx`): the landing page, the guides, `/privacy` |
| `app/(site)/page.tsx` | Landing page (server component): hero with `SampleQuestion` (fixed-seed questions from `sampleQuestions()`), drills, the infographics (`components/Infographics.tsx`: `caseForms`, `reviewIntervals`, the session mix), how it works, pricing, `StartButton` → `/today` |
| `app/(app)/` | The app inside `components/AppShell.tsx` (its `layout.tsx`): sidebar from 768 px, top bar + bottom tabs on a phone |
| `app/(app)/learn/` | The app's home dashboard (`components/Dashboard.tsx`): greeting, the red "Today's practice" panel (`components/TodayButton`), stats, the last 28 days, weak spots, the drills. Links that mean "back to the app" go here, never to `/` |
| `app/(app)/profile/`, `settings/`, `billing/` | Account pages (`AccountTabs` on phones). Profile: name (`polish.profile.v1`), the plan and email when signed in, totals, cards per drill, milestones (`lib/progressView.ts`). Settings: goal, new per day, sound, appearance (`polish.theme.v1`), analytics consent, delete device data; with accounts on, an Account group (sign in / email, sign out, "Email tips" marketing switch, export, delete account after typing the email). Billing: `BillingClient.tsx`, the current plan ("Pro · beta", Lifetime, Monthly / Annual with status and dates), "Manage billing" (Stripe Portal), the plan picker without a plan, and the `?checkout=done` return (`POST /billing/refresh`, then polls `/me` every 2 s for 30 s; sends `checkout_completed`); without an API, the free beta as before |
| `app/(site)/signin/` | Sign-in (noindex): email + the unticked marketing checkbox (text = `CONSENT_TEXT_V1`) → 6-digit code (`autocomplete="one-time-code"`) → `next` (made safe by `safeNext`), or `/plans?next=…` without access. Sends `sign_in_started`, `signed_in` |
| `app/(site)/plans/` | Plan picker (noindex): Annual pre-selected, Monthly, Lifetime while `/config` offers it; currency switch (default from `/config`); → `POST /billing/checkout` → Stripe Checkout. Sends `checkout_started` |
| `app/(site)/polish-cases/`, `polish-pronouns/`, `polish-numbers/`, `polish-verbs/` | Grammar reference pages for search, static, built from `lib/guides.ts` with `components/Guide.tsx`. Polish text goes in `<Pl>` (`lang="pl"`); a plain string with Polish words in it (the drill blurbs in `lib/drills.ts`) marks them `*like this*` and renders through `PlText` |
| `app/sitemap.ts`, `app/robots.ts` | Metadata routes (`dynamic = "force-static"`, required by the static export). Absolute URLs from `BRAND.url` (`https://polishup.app` unless `NEXT_PUBLIC_SITE_URL` overrides it) |
| `app/today/` | Today's practice: `buildToday` on a progress snapshot taken at mount, run by the shared `Runner`; a wrong card is asked once more at the end. Saved after every answer (`polish.today.v1`, via `Runner`'s `onProgress`) and resumed the same day (`resume`) |
| `app/(app)/progress/` | Streak, today's goal ring, the last 28 days, weak spots (each linking to a configured `/practice` session). The settings are on `/settings` |
| `app/(app)/<drill>/` | One configurator per drill (cases, pronouns, possessives, numbers, verbs, shuffle): `page.tsx` (server) sets the `<title>`, `<Drill>Client.tsx` holds the form, built from `components/Configurator.tsx` (`useConfigurator`, `ConfiguratorPage`, the shared steps `CaseField`, `GenderField`, `NumberChoices`, `AnswerField`, `CountField`). They write the session URL |
| `app/practice/` | Reads the URL, builds the session and hands it to `Runner` |
| `app/(site)/privacy/`, `components/Privacy.tsx` | Privacy policy (approved by the owner; change its `LAST_UPDATED` with every edit, and keep it true to `lib/analytics.ts` and the PostHog settings); `ConsentChoice` and `ClearLocalData` (every `polish.*` key), also used on `/settings` |
| `lib/analytics.ts` | Analytics (plans/phase-3.md §4): `track(event, props)` is a no-op unless `NEXT_PUBLIC_POSTHOG_KEY` is set and `polish.consent.v1` is `granted`; `EVENT_SCHEMA` lets only enum values and counts through; `nextConsent` state machine; posthog-js is `import()`ed only after consent (EU host). Imports no runtime code but `lib/types`, since every page loads it |
| `components/AccessGate.tsx` | The paywall around `Runner` in `/today` and `/practice`, before the session is built. No API → pass-through; until hydrated → nothing; signed out → `/signin?next=…`; no access in the cached entitlement → one `GET /me`, then `/plans?next=…` (`paywall_shown`). Client-only, bypassable, accepted. Access is judged at mount |
| `components/AccountSync.tsx` | Mounted in the layout: with accounts on, `import()`s `lib/sync` and runs `startAutoSync` (so pages without accounts never load it) |
| `components/account.tsx` | Shared account bits: `SyncOnFinish` (forced sync in a session's results), `useLiveConfig`, `planName`, `formatDate`, `MergedNotice` (once, after a first sync merged this device's progress), `markCheckout` / `takeCheckout` (plan + currency in sessionStorage `polish.checkout.v1`, this tab only) |
| `components/PricingLive.tsx` | The landing page's run-time pricing (with accounts on): `TrialPerk`, `BetaNote` ("Free during the beta: sign in to start"), `LifetimeCard` while the offer runs, all from `/config` |
| `components/Analytics.tsx`, `components/ConsentBanner.tsx` | Mounted in the layout: start PostHog after an earlier consent, `pwa_installed` (`appinstalled` or the `pwa-installed` window event), the banner (only with a key and no choice yet) |
| `components/` | (`ExerciseCard`'s gap is deliberately not in a `<form>` and has no `name`: phones took it for a login and offered passwords above the keyboard; Enter is handled on the input.) `SiteHeader`, `SiteFooter` (public pages), `AppShell` (+ `AppPage`, `ACCOUNT`), `AccountTabs`, `Logo` (`FlagMark`), `DrillIcon` (one Lucide icon per drill), `Dashboard`, `progress` (`ActivityGrid`, `StatCard`, `WeakSpotList`), `Infographics`, `StartButton`, `SampleQuestion`, `Guide`, `Runner` (full-screen session: ✕, progress bar, sound; grades, records every answer and sends the analytics events; shared by `/practice` and `/today`), `ExerciseCard` (one question, Polish-letter keys, speech, keyboard), `ResultsSummary` (with `InstallCard`), `TodayButton` (the red panel), `today` (`useTodayStatus`, `useNow`, `GoalRing`, `GoalStatus`), `ui` (`Choice`, `Field`) |
| `lib/storage.ts` | localStorage: configs, sound, theme (`useTheme`, `setTheme`), profile (`useProfile`, `saveProfile`), the v2 log / progress / settings hooks (`useProgress`, `useSettings`, `recordAnswer`…), v1 migration, compaction past 20,000 events, today's session (`readTodaySession`, `saveTodaySession`), the install card's dismissal (`polish.installCard.v1`). Phase 4 keys: `polish.account.v1` (`{ token, email, user, entitlement }`, `useAccount`), `polish.outbox.v1` (events answered while signed in that the server has not acknowledged; `recordAnswer` appends in the same write as the log), `polish.sync.v1` (`cursor` = highest server seq, `settingsAt` / `profileAt` = when the local value changed, `settingsSynced` / `profileSynced` = the stamp the server holds, `joined` = a first sync since sign-in succeeded, cleared on sign-out; `merged` = show `MergedNotice` once, only when that first sync pushed local progress), `polish.apiConfig.v1` (`GET /config`, kept on sign-out). `startAccountState` (sign-in: outbox = whole log, cursor 0), `clearAccountState` (sign-out / 401: token, entitlement, outbox, cursor go; local progress stays), `eventKey`, `outboxSafeKeep` |
| `lib/account.ts` | API client for `workers/api`, typed with `import type` from `workers/api/src/contract.ts`: `apiEnabled`, `request` (throws `ApiFailure`; a 401 clears the account), `getConfig`, `startSignIn`, `verifyCode`, `fetchMe`, `setConsent`, `startCheckout`, `refreshBilling`, `openPortal`, `exportData`, `deleteAccount`, `signOut`; `hasAccess(entitlement, now)` = `access` and `now < max(until ?? ∞, checkedAt + 7 days)` |
| `lib/sync.ts` | Sync (plans/phase-4.md §6–7): `mergeLogs` (union by `(t, card)`, sorted), `rebuild` (always a full `replay`), `syncNow` (push ≤ 500 outbox events, pull, loop while `more`; 30 s throttle unless forced; `keepalive` on page hide), `startAutoSync` (app start, `online`, `visibilitychange`; `GET /me` too) |
| `lib/plans.ts` | Plans and prices for display (`PLAN_INFO` in minor units, EUR / USD / PLN), `formatPrice`, `TAX_NOTE`, `TRIAL_DAYS`, `lifetimeOffered`, `plansOffered`. Must equal the Stripe prices and `PRICE_TEXT` in `workers/api/src/billing.ts` |
| `lib/theme.ts` | `THEME_KEY` and the theme values, React-free so the server layout can build its script from them |
| `lib/progressView.ts` | Pure helpers for the progress UI: `MISS_LABELS` (miss kind → English), `skillConfig` / `skillHref` (weak skill → configured session), `lastDays`, `dueCount`, `recentAccuracy`, `totalAnswered`, `cardsByDrill`, `casesPractised`, `milestones`, `safely` |
| `lib/missKind.ts` | `missKindOf(input, exercise)`: the `MissKind` logged with a wrong answer (`diagnoseVerbMiss` for verbs, `diagnoseNumberMiss` for numbers, then `diagnoseMiss`) |
| `lib/guides.ts` | Reference-page content: ending tables, case triggers (one per distinct template `note`, each with a sentence from `exampleExercise` in `lib/generate.ts`), pronoun / numeral / verb tables, example sentences from the drill builders with fixed seeds, configured `/practice` hrefs, the landing samples and infographics (`caseForms`, `reviewIntervals` from the real scheduler). **Every Polish form comes from the grammar code or the lexicon**; model words (student, kot, dom, kobieta, okno, pisać…) throw at build time if they leave the lexicon. Tested in `lib/__tests__/guides.test.ts` |
| `lib/site.ts` | `TOPIC_PAGES`, `INDEXED_PATHS` (sitemap), `pageMetadata` (title, description, Open Graph, canonical when `BRAND.url` is set), `NOINDEX` (on `/practice`, `/today`, `/signin`, `/plans`), `ACCOUNTS_ON` (server-safe twin of `apiEnabled`), `safeNext` (a `next` param → same-origin path or fallback), `signInHref`, `plansHref` |
| `lib/brand.ts` | `BRAND`: product name, tagline, description, site URL, owner and contact email. The only place the name is written; titles, manifest, landing and privacy pages read it |
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
| `lib/today.ts` | `buildToday`: today's session from due reviews (≤ 70% while new cards exist), new cards (by level, drills taking turns, no word or skill twice in a row) within the daily budget, then weakest-skill / soonest-due filler, then more new cards up to the goal; interleaved by drill; `daySeed`, `cardSeed`. Resuming: `RunState` (list, re-asks, next position, scored verdicts), `SavedToday`, `resumableToday` (same local day, consistent, unfinished) |
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
| `workers/api/` | Cloudflare Worker + D1 for accounts (`api.polishup.app`): email-code auth, sessions, `/sync`, `/account/*`, Stripe Managed Payments (`src/stripe.ts` is the only SDK user), the webhook, entitlements, the Resend contact list and signed unsubscribe, two Cron Triggers (hourly: trial reminders, list retries; daily 03:30 UTC: clean-up), per-kind daily email budgets (`EMAIL_BUDGETS`), `trial_history` (one trial per email, kept after deletion). `src/contract.ts` is types and constants only, imported by the app with `import type`. Own `package.json`, tests, README; excluded from the root tsconfig and vitest |
| `app/manifest.ts` | Web app manifest (static metadata route → `out/manifest.webmanifest`): name from `BRAND`, `start_url` `/today`, standalone, colours parsed from `--background` in `app/globals.css`, icons from `public/icons/` |
| `public/sw.js` | Hand-written service worker **template**: precache, network-first pages mapped to `<route>.html` (query ignored), cache-first `/_next/static`, LRU-capped (300) cache of TTS Worker audio (base URL from its `?tts=` param), no `skipWaiting`. Its `const BUILD = null;` line is replaced after the build; unstamped it unregisters itself |
| `scripts/sw-manifest.ts` | Post-build step of `npm run build`: lists `out/` (pages, RSC `.txt`, `_next/static`, icons, manifest), hashes them plus the build time into a version, writes `out/sw-precache.json` and stamps `out/sw.js` |
| `components/ServiceWorker.tsx` | Registers `/sw.js?tts=<NEXT_PUBLIC_TTS_URL>` in production builds only; re-dispatches `appinstalled` as a window CustomEvent `pwa-installed` (for analytics) |
| `lib/install.ts`, `components/InstallButton.tsx`, `components/InstallCard.tsx` | Installing from inside the app (Settings, and `InstallCard` on the results screen: on the 2nd, 7th and 15th practice day (`INSTALL_CARD_DAYS`, `practiceDay`), only in the prompt / ios states; closing it hides it until the next of those days; `offersInstallCard`). `INSTALL_SCRIPT` runs in `<head>` (`app/layout.tsx`) because `beforeinstallprompt` often fires before React loads: it keeps the event on `window.__installPrompt` and dispatches `install-prompt`. `installState` → installed / prompt (button opens it) / ios (Share → Add to Home Screen steps) / manual (browser menu) |
| `public/brand/icon.svg`, `scripts/icons.ts` | Icon source and `npm run icons`: → `public/icons/{icon-192,icon-512,maskable-512}.png`, `app/apple-icon.png`, `app/favicon.ico` (sharp). While the SVG carries the "generated by scripts/icons.ts" marker it is regenerated from `BRAND.name`'s first letter on `--accent` |
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
9. **Deploy with `npm run build`, never `next build` alone.** The post-build
   `scripts/sw-manifest.ts` stamps `out/sw.js`; without it the worker caches
   nothing. A new worker version waits for every tab to close (no
   `skipWaiting`), and offline pages are the ones precached by that version, so
   they always match its `_next/static` files. To test offline locally, serve
   `out/` (e.g. `python3 -m http.server` inside it); `npm run dev` never
   registers the worker.
10. **Icons are generated.** Don't edit the PNGs or `app/favicon.ico` by hand:
   change `public/brand/icon.svg` (or `BRAND.name` / `--accent` while the
   placeholder monogram is in use) and run `npm run icons`.
11. **Style through the design system.** Colours, radii and shadows are tokens
   in `app/globals.css`; buttons, cards, chips and controls are its classes
   (`DESIGN.md`). A new colour gets a light and a dark value (both dark
   blocks). Icons are Lucide (`lucide-react`), `aria-hidden` beside a label;
   drills use `DrillIcon`. Every page must work at 360 px with no horizontal
   scroll. The first `:root` block must keep `--background` and `--accent`
   (read by `app/manifest.ts` and `scripts/icons.ts`).
12. **Analytics carry no free text.** A new event or prop goes into
   `EventProps` and `EVENT_SCHEMA` in `lib/analytics.ts` (enum values or counts
   only), the event table in `README.md` and, if it changes what is collected,
   the privacy policy (`app/(site)/privacy/page.tsx`, with a new date). Nothing from
   PostHog may load or be stored before consent; keep `lib/analytics.ts` free
   of the lexicon and progress imports (it is on every page).

13. **Accounts are off without `NEXT_PUBLIC_API_URL`.** `apiEnabled()` /
   `ACCOUNTS_ON` gate everything: `AccessGate` passes through, nothing syncs, no
   API call is made. Tests and dev run that way; keep it working.
14. **An answer's identity is `(t, card)`; merges always replay.** `mergeLogs`
   unions by that key, then `rebuild` runs a full `replay` from `base`. Never
   `apply` pulled events one by one: SM-2 is path-dependent. `AnswerEvent` got
   no new field, so the log format and the golden test are unchanged.
15. **Outbox events are never compacted.** Compaction keeps at least everything
   from the oldest outbox event on (`outboxSafeKeep`); the outbox is cleared
   only of the events a 200 acknowledged. Settings / profile never stamped on
   this device are sent with `updatedAt` 1, so the account's value wins (§7.5).
16. **Marketing email only with consent.** The sign-in checkbox is unticked and
   never a condition; `marketingConsent: false` never withdraws. Every account
   is a Resend contact, `unsubscribed` unless it consented. Login codes and the
   trial reminder are transactional. Never send the email, user id or consent
   to PostHog (no `identify`).
17. **The Worker validates drills and cases.** `DRILLS` / `CASES` in
   `workers/api/src/sync.ts` copy `lib/types.ts`; deploy the Worker with a new
   drill or case before the app that records it, or `/sync` rejects it (400).
18. **Prices live in three places:** `lib/plans.ts`, the Stripe Prices and
   `PRICE_TEXT` in `workers/api/src/billing.ts`. Change them together.

## Commands

```bash
npm ci                  # also: cd workers/tts && npm ci, for Worker work
npm run dev             # http://localhost:3000; npm run dev:drafts shows drafts
npm test                # both vitest projects (~670 tests)
npm run lint
npm run build           # static export to out/, then stamps out/sw.js + out/sw-precache.json
npm run icons           # regenerate all icons from public/brand/icon.svg (or BRAND's monogram)
npx tsc --noEmit        # run AFTER a build: LayoutProps in app/layout.tsx is generated by next build
npm run review:export   # review/pending.csv for the native reviewer (git-ignored)
npm run audio:manifest  # ~90 s; commit audio/manifest.jsonl if it changed
NEXT_PUBLIC_API_URL=http://localhost:8787 npm run dev   # the app with accounts, against a local workers/api
# .claude/launch.json: "api" (wrangler dev :8787), "app-accounts" (serves out/ on :3001;
#   build first with NEXT_PUBLIC_API_URL=http://localhost:8787 npm run build)

cd workers/api          # the API Worker (README there: vars, secrets, owner setup)
npm test && npm run typecheck
npx wrangler d1 migrations apply polishup-api --local   # or --remote before a deploy that needs it
npm run dev             # wrangler dev, http://localhost:8787 (DEV_LOG_EMAIL=true in .dev.vars logs codes instead of emailing)
npm run deploy
```

Before committing, run test, lint, build, then tsc. All four must be clean.
Touching `workers/api`: also `npm test && npm run typecheck` in it.

## How to add things

- **A word or template.** Append it to the right `data/*.json` file as a draft,
  with `level` (A1–B2) and `freq` (1–5) per the rules in `data/README.md`. Then
  run `npm test` and read generated sentences.
- **A drill.** Write one builder file in `lib/`, add one entry in
  `lib/drills.ts`, add its kind to `DRILL_KINDS` and `EXERCISE_KINDS` in
  `lib/types.ts`, and add one configurator in `app/(app)/<drill>/` (a server
  `page.tsx` with its `metadata` title, the form in `<Drill>Client.tsx` built
  from `components/Configurator.tsx`). Add a
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
- **Phase 3 (ship the web app) is done: live at https://polishup.app**
  (Cloudflare Pages from `main`; landing page, topic pages, PWA and offline,
  PostHog EU after consent, approved `/privacy`, Search Console). The name
  **PolishUp** and the domain live only in `lib/brand.ts`.
- **Now: the beta is running.** Small leftovers are in the roadmap's "Later" list.
- **Phase 4 (accounts, sync, payments) code is done**, behind
  `NEXT_PUBLIC_API_URL` (unset in production, so nothing changed for
  learners). Waiting on the owner: Stripe / Resend / Cloudflare setup
  (`workers/api/README.md`), the end-to-end test in Stripe test mode, and
  re-approving `/privacy` (rewritten for accounts) before the variable is set.
