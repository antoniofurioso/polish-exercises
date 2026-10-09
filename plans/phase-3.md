# Phase 3: Ship the web version

Status: ◐ in progress. Goal: a public site that real learners can install, use
offline and come back to, plus the measurement to tell whether they do.

## Decisions so far

| Question | Decision |
| --- | --- |
| Name, colours, logo | **Not chosen yet.** Name research for SEO in [naming.md](./naming.md); the owner picks. Until then everything reads from `lib/brand.ts` (placeholder "Ćwiczenia"), so the rename is a one-file change plus the icons |
| Analytics | **PostHog**, EU cloud, only after consent |
| Privacy policy | Draft under the owner's name (Antonio Furioso); contact email to be created (`NEXT_PUBLIC_CONTACT_EMAIL`) |
| Domain | **None yet.** `NEXT_PUBLIC_SITE_URL` is empty until there is one; sitemap / canonical URLs use it when set |

## 1. Brand in one place

`lib/brand.ts` (`BRAND`: name, short name, tagline, description, url, owner,
email). Page titles (`app/layout.tsx` title template), the web manifest, the
landing page and the privacy policy all read from it. Icons are generated from
one source SVG (`public/brand/icon.svg`) by a script, so a new logo means
replacing one file and re-running it.

## 2. PWA and offline

- `app/manifest.ts` (Next metadata route, static): name from `BRAND`,
  `start_url: "/today"`, `display: "standalone"`, theme and background colours
  from the CSS tokens, icons 192 / 512 / maskable 512 and an Apple touch icon.
- Placeholder icon: a simple monogram on the accent colour, generated to
  PNG by `scripts/icons.ts`. The create-next-app assets in `public/` and
  `app/favicon.ico` are removed.
- Service worker `public/sw.js`, hand-written (no Workbox dependency):
  - precaches the app shell after a build: every HTML page and `_next/static`
    file listed by `scripts/sw-manifest.ts`, which writes the list with a build
    hash into `out/sw-precache.json` (`npm run build` runs it);
  - HTML: network first, falling back to the cache, so a deploy shows up on the
    next load; `_next/static`: cache first (hashed file names);
  - audio from the TTS Worker: cache on first play, capped (LRU ~300 clips), so
    sentences heard online replay offline; the browser voice remains the
    fallback;
  - a new version activates on the next visit, never mid-session.
- `components/ServiceWorker.tsx` registers it in production only.
- Everything a learner does is already client-side and in localStorage, so
  drills, `/today` and `/progress` work offline once the shell is cached.

## 3. Landing page and SEO

- `/` becomes the landing page: what the app is, a live sample question, the
  drills, how the daily practice works, and "Start practising" → `/today`. A
  returning learner (progress in storage) sees "Continue — N due" instead.
- The drill menu moves from `/` to `/learn`; links that pointed at `/` as "home"
  of the app point at `/learn`.
- One indexable page per topic, written for search intent, each with a short
  explanation, a table, examples generated from the lexicon at build time and a
  "Practise this" button: `/polish-cases`, `/polish-pronouns`,
  `/polish-numbers`, `/polish-verbs` (exact slugs follow the naming research).
- `app/sitemap.ts` and `app/robots.ts` (only when `NEXT_PUBLIC_SITE_URL` is set),
  per-page `metadata` (title, description, Open Graph), and `lang="pl"` on Polish
  text.
- Runner pages (`/practice`, `/today`) are `noindex`.

## 4. Analytics and consent

- `posthog-js`, EU host, key from `NEXT_PUBLIC_POSTHOG_KEY` (no key → analytics
  off entirely, as in development and tests).
- Consent banner on first visit: "Allow" / "No thanks", remembered in
  localStorage. Before consent nothing is sent and nothing is stored by PostHog.
  "No thanks" is final until changed on `/privacy`.
- Events (no answer text, nothing personal): `session_started` {source: today /
  practice, drill, size}, `answer` {drill, verdict}, `session_finished` {source,
  size, correct}, `goal_met` {goal, streak}, `pwa_installed`. Page views with
  autocapture off.
- Day-7 return is a PostHog retention insight on `session_started`.

## 5. Privacy policy

`/privacy`: who runs the site (`BRAND.owner`, `BRAND.email`), what is stored on
the device (progress, settings — never sent anywhere), what analytics collect
and only with consent, the processor (PostHog, EU), retention, the learner's
rights under the GDPR and how to withdraw consent (a toggle on the page). Linked
from the footer of every page.

## 6. Beta (owner)

20–30 learners from r/learnpolish and expat groups in Poland. Measure day-7
return before building payments. Drafted posts in `plans/beta-posts.md` once the
name and domain exist.

## Work split

| # | Piece | Files |
| --- | --- | --- |
| N | Name research | `plans/naming.md` |
| P | PWA, icons, offline | `app/manifest.ts`, `public/`, `public/sw.js`, `scripts/icons.ts`, `scripts/sw-manifest.ts`, `components/ServiceWorker.tsx`, `package.json` scripts, `app/favicon.ico` |
| L | Landing, `/learn`, topic pages, sitemap | `app/page.tsx`, `app/learn/`, `app/polish-*/`, `app/sitemap.ts`, `app/robots.ts`, `components/` (new ones, nav links) |
| A | PostHog, consent, privacy | `components/Analytics.tsx`, `lib/analytics.ts`, `app/privacy/`, event calls in `components/Runner.tsx` / `app/today/` |

## Done when

- [ ] The name is chosen and in `lib/brand.ts`, with icons.
- [ ] The app installs on Android and iOS and runs a session offline.
- [ ] `/` explains the app and gets a new visitor into a session in one click.
- [ ] Analytics run only after consent, and day-7 retention can be read in PostHog.
- [ ] `/privacy` is complete apart from the contact email.
- [ ] All gates green; Lighthouse PWA and SEO checks pass on the built site.
