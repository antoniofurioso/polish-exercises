# API Worker — accounts, sync, billing

A Cloudflare Worker with a D1 database, on `api.polishup.app`. It signs
learners in with a 6-digit email code, syncs the answer log, settings and
profile name between devices, sells the plans through Stripe Managed Payments
(Stripe is merchant of record and handles VAT), sends the login codes and the
trial reminder through Resend, and keeps every account in step with a Resend
contact list. Full spec: [`plans/phase-4.md`](../../plans/phase-4.md).

The app uses it only when `NEXT_PUBLIC_API_URL` is set at build time. Unset,
there are no accounts, no sync and no paywall: the app behaves as before.

Runs on the Cloudflare **free plan** (10 ms CPU and 50 subrequests per
request, D1 100,000 rows written a day). `/sync` inserts through `json_each`
and splices stored JSON into the response for that reason.

## Layout

| Path | What it is |
| --- | --- |
| `src/index.ts` | Router (`handle(request, env, ctx)`, called directly by tests) and the `scheduled` handler (both Cron Triggers) |
| `src/contract.ts` | Request and response types, error codes, plans, currencies, limits, `CONSENT_TEXT_V1`. **Types and constants only, no runtime imports**: the app imports it with `import type` (`lib/account.ts`, `lib/sync.ts`, `lib/plans.ts`) |
| `src/env.ts` | `Env` (bindings, vars, secrets) |
| `src/config.ts` | `GET /config`: `BETA_OPEN`, `LIFETIME_OFFER_UNTIL`, currency from `request.cf.country` (PL → pln, euro area → eur, else usd) |
| `src/cors.ts` | Origin allow-list |
| `src/auth.ts` | `/auth/start`, `/auth/verify` (the **only** place `beta` is granted), sessions, `/auth/signout` |
| `src/sync.ts` | `/sync`; event validation (`DRILLS`, `CASES`, `VERDICTS` copied from `lib/types.ts`) |
| `src/account.ts` | `/me`, `/account/consent`, `/account/export`, `DELETE /account` |
| `src/billing.ts` | `/billing/*`, the webhook, the Stripe part of deletion, the trial reminder (`PRICE_TEXT`) and the billing half of the cron |
| `src/stripe.ts` | The thin Stripe module: nothing else imports the SDK |
| `src/entitlement.ts` | Derivation from Stripe objects and the D1 write, with the precedence `beta` > `lifetime` > subscription |
| `src/list.ts` | Resend contacts and segments, `list_dirty` retries, the signed unsubscribe link |
| `src/email.ts` | Resend `fetch` wrapper, `EMAIL_BUDGETS` (daily caps per kind), `DEV_LOG_EMAIL`, the login-code email |
| `src/cron.ts` | `0 * * * *`: trial reminders and list retries (`runBillingCron`); `30 3 * * *`: clean-up of expired codes, sessions, old webhook ids and counters |
| `src/db.ts`, `src/http.ts` | SQL helpers; JSON responses and errors |
| `migrations/` | D1 schema (`0001_init.sql`) |
| `test/` | vitest; D1 is `node:sqlite` running the real migrations (`test/d1.ts`), Stripe, Resend and the rate limiters are mocked |

## Endpoints

JSON in and out. Authenticated calls send `Authorization: Bearer <token>`
(no cookies). Every error is `{ "error": "<code>", "message": "…" }`; a 401 is
always exactly `{ "error": "unauthorized" }`, and the app then drops the token
and keeps the local data.

| Method, path | Auth | Does |
| --- | --- | --- |
| `GET /health` | – | `{ ok: true }` |
| `GET /config` | – | `{ betaOpen, lifetimeOfferUntil, currency }`, `Cache-Control: private, max-age=300` |
| `POST /auth/start` | – | `{ email }` → emails a code. Same answer for known and unknown emails. 429 `rate_limited` `{ retryAfter }`, 503 `email_unavailable` |
| `POST /auth/verify` | – | `{ email, code, marketingConsent? }` → `{ token, user, isNew, entitlement }`. Creates the account (with `beta` while `BETA_OPEN`). `marketingConsent: false` never withdraws an existing consent. 400 `invalid_code` `{ attemptsLeft }`, 410 `code_expired` |
| `POST /auth/signout` | ✓ | Deletes this session |
| `GET /me` | ✓ | `{ user, entitlement, config }` |
| `POST /sync` | ✓ | Push up to 500 events (1 MB), pull up to 1,000 after the cursor. Unknown event fields are dropped before storing; `base` must be v2-shaped and is kept only if the account has none; settings and profile last-write-wins by `updatedAt`, clamped to at most now + 1 day. 413 `too_large` |
| `POST /account/consent` | ✓ | `{ marketing }` → `{ user }` |
| `GET /account/export` | ✓ | Everything the account holds, as a JSON download |
| `DELETE /account` | ✓ | Cancels subscriptions now (no refund), deletes the Stripe customer, removes the Resend contact, deletes every D1 row. 502 `stripe_error`: nothing deleted |
| `POST /billing/checkout` | ✓ | `{ plan, currency }` → `{ url }` (Stripe Checkout; 3-day trial unless this account or this email in `trial_history` had one). 409 `already_subscribed` (also when Stripe still has a live subscription for the customer), 409 `has_lifetime_or_beta`, 410 `offer_ended` |
| `POST /billing/refresh` | ✓ | Re-reads the customer at Stripe → `{ entitlement }` (same path as the webhook) |
| `POST /billing/portal` | ✓ | `{ url }` (Customer Portal, back to `/billing`). 409 `no_customer` |
| `POST /billing/webhook` | Stripe signature | Body capped at 256 KB. De-duplicated by event id in `stripe_events` (`processed_at` NULL while in flight): a duplicate of an event still being processed gets **409**, so Stripe retries it; a claim older than 5 minutes is taken over. Re-fetches the customer from Stripe, never trusts the payload |
| `GET /email/unsubscribe?u=&s=` | signed link | An HTML page with an "Unsubscribe" button only (mail scanners open links, so GET changes nothing) |
| `POST /email/unsubscribe?u=&s=` | signed link | RFC 8058 one-click (`{ ok: true }`), or `confirm=1` from the button (an HTML page). Sets `marketing_consent = 0` |

CORS: exact origins from `ALLOWED_ORIGINS`, plus any `https://*<ALLOWED_ORIGIN_SUFFIX>`
(Pages previews). A request with a foreign `Origin` gets **403** before any
handler runs; requests without `Origin` (curl, server to server) go through
without CORS headers. The webhook and the unsubscribe link have no CORS and no
Origin check.

Rate limits: `/auth/start` 5 a minute per IP (`AUTH_IP_LIMITER`), and per
email 1 a minute, 5 per 15 minutes, 10 a day; `/auth/verify` 10 a minute per
IP (`VERIFY_IP_LIMITER`) and 5 tries per code. The IP limiters key an IPv6
address by its /64; a missing binding lets requests through and logs it.
A used code's `login_codes` row is kept with an empty hash so the per-email
limits still apply; the daily clean-up deletes it once the UTC day is over.

Email budgets per UTC day (`EMAIL_BUDGETS` in `src/email.ts`, Resend's free
plan allows 100): `email_new` 50 (codes for addresses without an account),
`email_known` 30 (codes for existing accounts), `email_reminder` 20 (trial
reminders). One kind can never starve another; an exhausted budget answers
503 `email_unavailable`. Known leak: while `email_new` is spent, an unknown
address gets 503 and a known one 200, so the answer hints whether an account
exists (open point: Turnstile on `/auth/start`).

Request bodies are read as a stream and abandoned past their cap (1 MB for
`/sync`, 256 KB for the webhook, 64 kB otherwise).

Entitlements: every Stripe read stores `read_at`, and an older read never
overwrites a newer one; the precedence `beta` > `lifetime` > subscription is
enforced in the SQL write. `trial_history` (a peppered hash of the email)
survives account deletion, so the 3-day trial is once per email address.

## Configuration

**Bindings:** `DB` (D1 `polishup-api`), `AUTH_IP_LIMITER`, `VERIFY_IP_LIMITER`
(rate limits), and two Cron Triggers: `0 * * * *` (at most 5 reminders and 4
list users per run, ≤ 45 subrequests including D1) and `30 3 * * *`
(clean-up). Keep `crons` in `wrangler.toml` equal to `HOURLY_CRON` /
`CLEANUP_CRON` in `src/cron.ts`.

**Vars** (`wrangler.toml`; a change needs `npm run deploy`, not an app build):

| Var | Meaning |
| --- | --- |
| `ALLOWED_ORIGINS` | Comma-separated exact origins (`https://polishup.app,http://localhost:3000`) |
| `ALLOWED_ORIGIN_SUFFIX` | `.polish-exercises.pages.dev` (previews) |
| `APP_URL` | `https://polishup.app`: Checkout success / cancel, the Portal's return, links in emails |
| `API_URL` | `https://api.polishup.app`: the unsubscribe links |
| `EMAIL_FROM` | `PolishUp <hello@mail.polishup.app>` (a verified Resend domain) |
| `BETA_OPEN` | `"true"` / `"false"`, see below |
| `LIFETIME_OFFER_UNTIL` | ISO date, see below |
| `PRICE_MONTHLY`, `PRICE_ANNUAL`, `PRICE_LIFETIME` | Stripe Price ids |
| `DEV_LOG_EMAIL` | Local only (`.dev.vars`): `"true"` logs each email (subject with the code) to the console instead of sending it. Never set in production |
| `RESEND_SEGMENTS` | JSON: `{"beta":"…","trialing":"…","monthly":"…","annual":"…","lifetime":"…","former":"…"}` (Resend segment ids) |

**Secrets** (`npx wrangler secret put <NAME>`): `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `CODE_PEPPER` (random; hashes login
codes), `UNSUB_SECRET` (random; signs unsubscribe links: changing it breaks
every link already sent and stored on the contacts).

### The two switches

- **`BETA_OPEN`.** `"true"`: every account created now gets the `beta`
  entitlement (Pro free, for good, no card). Set `"false"` and deploy to close
  the beta: new accounts start with no plan and go through the 3-day trial and
  Checkout. Existing `beta` rows are never touched. The app reads the mode from
  `/config` at run time, so no app build is needed.
- **`LIFETIME_OFFER_UNTIL`.** An ISO date (`"2026-12-31"`, read as UTC
  midnight). Before it, `/plans` and the landing page show Lifetime and
  checkout sells it; from that instant on checkout answers 410 `offer_ended`
  and the UI hides it. Empty = no Lifetime offer.

### Prices

Three places must agree: `lib/plans.ts` (what the app shows), the Stripe
Prices (what is charged) and `PRICE_TEXT` in `src/billing.ts` (the trial
reminder). Change all three together.

## Develop

```bash
cd workers/api
npm ci
npm test            # vitest (needs Node 22, for node:sqlite)
npm run typecheck
```

Run it locally. `workers/api/.dev.vars` (git-ignored) holds the secrets and
overrides `[vars]`; a sample with no real secrets:

```ini
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
APP_URL=http://localhost:3001
API_URL=http://localhost:8787
# log emails (with the code) to the console instead of sending them
DEV_LOG_EMAIL=true
CODE_PEPPER=dev-pepper-change-me
UNSUB_SECRET=dev-unsub-change-me
# Stripe test mode, only for billing work:
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx      # printed by `stripe listen` below
RESEND_API_KEY=re_xxx                # unused while DEV_LOG_EMAIL=true
PRICE_MONTHLY=price_xxx
PRICE_ANNUAL=price_xxx
PRICE_LIFETIME=price_xxx
LIFETIME_OFFER_UNTIL=2026-12-31
```

```bash
npx wrangler d1 migrations apply polishup-api --local
npm run dev                                            # wrangler dev, http://localhost:8787
stripe listen --forward-to localhost:8787/billing/webhook   # billing work only
# then, from the repo root, either the dev server (port 3000)…
NEXT_PUBLIC_API_URL=http://localhost:8787 npm run dev
# …or a production build served on 3001 (service worker included):
NEXT_PUBLIC_API_URL=http://localhost:8787 npm run build && npx serve out -l 3001
```

In Claude Code, `.claude/launch.json` has the same as configs: `api` (wrangler
dev on 8787) and `app-accounts` (serves `out/` on 3001; build it first with
`NEXT_PUBLIC_API_URL=http://localhost:8787 npm run build`).

Test cards and a test clock (trial → active) cover the billing flow; see
`plans/phase-4.md` §17 for the end-to-end checklist.

## Deploy

```bash
npx wrangler d1 migrations apply polishup-api --remote   # after adding a migration
npm run deploy
```

New migrations go in `migrations/000N_….sql` and are applied before the deploy
that needs them. **A new drill or case** in `lib/types.ts` must be added to
`DRILLS` / `CASES` in `src/sync.ts` and deployed before the app that records
it ships, or `/sync` rejects those events with 400 and they stay in the
learner's outbox.

## Owner setup

Do it all in Stripe **test mode** first, run the end-to-end test, then repeat
with live keys.

1. **Stripe**
   - Activate **Managed Payments** before any live sale (subscriptions cannot
     be moved into it later).
   - Three Products (Monthly, Annual, Lifetime), each with one Price in EUR
     with `currency_options` for USD and PLN, at the prices in `lib/plans.ts`.
     Monthly and Annual recurring, Lifetime one-time. Copy the three price ids
     into `PRICE_*`.
   - Customer Portal: cancel, update the card, switch Monthly ↔ Annual,
     invoices. Dunning: retries, then cancel. Turn off Stripe's own trial
     reminder email if it would duplicate ours.
   - Webhook endpoint `https://api.polishup.app/billing/webhook` with these
     events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `invoice.paid`, `invoice.payment_failed`, `charge.refunded`,
     `charge.dispute.created`, `charge.dispute.closed`. Copy its signing secret.
   - The Worker uses the API version pinned by its `stripe` package
     (`2026-09-30.endive` with stripe 23.0.0); set the webhook endpoint to the
     same version.
2. **Resend**
   - Add the sending domain (`mail.polishup.app`) and its SPF, DKIM and DMARC
     records in Cloudflare DNS. Create an API key.
   - **Create the contact properties `user_id`, `plan` and `unsub_url` (text)
     first**: Resend rejects contacts with properties it does not know, and the
     list would stay dirty.
   - Create six segments: `beta`, `trialing`, `monthly`, `annual`, `lifetime`,
     `former`, and put their ids in `RESEND_SEGMENTS`.
   - Broadcast templates must use the contact's `unsub_url` property as the
     unsubscribe link: Resend's own unsubscribe link is not wired back to D1
     (open point 5 in the spec).
3. **Cloudflare**
   - `npx wrangler d1 create polishup-api` (add `--location weur` to keep it in
     western Europe), paste the id into `wrangler.toml`, then
     `npx wrangler d1 migrations apply polishup-api --remote`.
   - `npx wrangler secret put` for `STRIPE_SECRET_KEY`,
     `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `CODE_PEPPER`, `UNSUB_SECRET`.
   - Set the vars: `BETA_OPEN = "true"`, `LIFETIME_OFFER_UNTIL`, `PRICE_*`,
     `RESEND_SEGMENTS`. `npm run deploy`.
   - Custom domain `api.polishup.app` on the Worker. Check both Cron Triggers
     are listed (the free plan allows 5 per account). Never set
     `DEV_LOG_EMAIL` here.
4. **Pages:** `NEXT_PUBLIC_API_URL=https://api.polishup.app` for Production
   (a test-mode Worker URL for Preview, or none), then rebuild.
5. **Before step 4 goes live:** approve the new `/privacy`. Tell the beta
   testers to sign in to keep their progress and get Pro free for good.
   Later, `BETA_OPEN = "false"` and deploy to start charging.
