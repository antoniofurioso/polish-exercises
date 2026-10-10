# Phase 3: Ship the web version

Status: ◐ live at https://polishup.app; the beta is what is left. Goal: a public site that real learners can install, use
offline and come back to, plus the measurement to tell whether they do.

## Decisions so far

| Question | Decision |
| --- | --- |
| Name, colours, logo | **PolishUp** (owner's pick after [naming.md](./naming.md)). In `lib/brand.ts` only; the placeholder monogram icon is generated from its first letter. Colours stay the current Polish red; a real logo replaces `public/brand/icon.svg` later |
| Analytics | **PostHog**, EU cloud, only after consent. Live: events arrive in the owner's EU project. `respect_dnt` is off, because "Allow analytics" is the learner's own opt-in (with it on, learners whose browser sends Do Not Track were never counted) |
| Privacy policy | **Approved by the owner** (Antonio Furioso), live at `/privacy` with the contact email from `NEXT_PUBLIC_CONTACT_EMAIL`. It states IP discarding, 12-month retention and a DPA with PostHog, so those PostHog settings must stay on |
| Domain | **polishup.app**: `BRAND.url` defaults to `https://polishup.app` (`NEXT_PUBLIC_SITE_URL` overrides it), so canonical links, Open Graph and the sitemap name it on every deployment, previews included |

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

### 3a. Visual redesign ☑

- White-and-red design system in `app/globals.css` (tokens, light and dark,
  shared classes), documented in `DESIGN.md`; Inter + Source Serif 4; Lucide icons.
- Landing page with infographics generated from the grammar code and scheduler.
- The app in a shell (`app/(app)/`): home dashboard at `/learn`, `/progress`,
  and the new account pages `/profile`, `/settings` (the goal settings moved
  here from `/progress`; appearance choice), `/billing` (free beta; no
  payments until Phase 4). Full-screen session view for `/today` and `/practice`.
- Mobile: bottom tabs in the app, a menu in the public header, no page wider
  than the screen at 360 px.

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

- [x] The name is chosen and in `lib/brand.ts`, with icons: PolishUp, polishup.app.
  A designed logo can replace the monogram later (`public/brand/icon.svg`, then
  `npm run icons`).
- [x] The app installs and runs a session offline: manifest, icons and the service
  worker checked in Chromium with the server stopped (pages, a practice answer,
  `/today`, cached audio). **Owner:** try it on a real Android and iOS phone.
- [x] `/` explains the app and gets a new visitor into a session in one click.
- [x] Analytics run only after consent, and events arrive in the live PostHog EU
  project. Day-7 retention is a Retention insight on `session_started` (README
  "Analytics and privacy").
- [x] `/privacy` is approved and live, with the contact email.
- [x] All gates green. Lighthouse 12 (which no longer has a PWA category) gives
  100 for accessibility, best practices and SEO on `/`, `/learn`, a topic page and
  `/privacy`; performance 74–76 on a local server.

## Live setup

- Cloudflare Pages, own Cloudflare account, production branch `main`, build
  command `npm run build`, output `out`; every other branch gets a preview URL.
- polishup.app is the custom domain. `NEXT_PUBLIC_CONTACT_EMAIL` is set for
  production and preview; `NEXT_PUBLIC_POSTHOG_KEY` for production only, so
  previews never show the banner or send events.

## Left for the owner

1. Google Search Console: add the `polishup.app` domain property and submit
   `https://polishup.app/sitemap.xml`.
2. PostHog: save the day-7 Retention insight to a dashboard; keep "Discard client
   IP data", 12-month retention and the signed DPA, as `/privacy` states.
3. Install the app on a real Android and iOS phone and practise offline.
4. Recruit the beta: 20–30 learners for 2–3 weeks (posts in `plans/beta-posts.md`),
   then decide on Phase 4 from day-7 return.

## Known gaps

- `/billing` is a placeholder: Pro has no price or feature list yet, and its
  "Tell me when it's ready" button appears only once `NEXT_PUBLIC_CONTACT_EMAIL` is set.

- The drill configurator pages are client components and keep the default title.
- Polish words inside English prose on the landing page and drill blurbs lack
  `lang="pl"`.
