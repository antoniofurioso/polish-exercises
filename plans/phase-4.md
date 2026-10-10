# Phase 4: Accounts, sync, payments

Status: ◐ code done; waiting on owner setup and the end-to-end test in Stripe
test mode. Everything is behind `NEXT_PUBLIC_API_URL`, unset in production, so
learners see no change yet. The rewritten `/privacy` needs the owner's
approval before that variable is set. Goal: a
learner signs in with an email code, finds the same progress on every device,
and, once the beta closes, pays to practise. The guides, the landing sample and
`/privacy` stay free.

## Decisions so far

| Question | Decision |
| --- | --- |
| Beta | **While the server flag `BETA_OPEN` is `true`, every new account gets Pro free, for ever** (a `beta` entitlement: no payment, no card). Sign-in alone unlocks the app. The owner closes the beta later by setting the flag to `false`; accounts that already have `beta` keep it. No detection of who was a beta tester |
| After the beta | **No free plan.** A 3-day free trial with a card, on Monthly and Annual. The trial lands on `/today`; a reminder email goes out on day 2. Free without an account: the landing page (with `SampleQuestion`), the guides (`/polish-cases` …) and `/privacy` |
| Plans sold | **Monthly, Annual and Lifetime.** Annual is the default and is highlighted. Lifetime is a limited-time offer for everyone, open until `LIFETIME_OFFER_UNTIL`; after that the server refuses it and the UI hides it. Later price rises apply to new users only |
| Payments | **Stripe Managed Payments** (Stripe is merchant of record and handles VAT), on the owner's existing account. The owner is a VAT-registered Polish JDG (sole proprietorship). Doing VAT ourselves (Stripe Tax + OSS) is rejected. Lemon Squeezy was considered and dropped. Billing code sits in one thin Stripe module (§9) |
| Tax display | EUR and PLN prices include tax; USD prices exclude it, if Managed Payments allows (open point 2) |
| Sign-in | **Email only, a 6-digit one-time code typed in the app.** Not a magic link: on iOS a link opens Safari, and Safari's storage is separate from the installed PWA. No Google sign-in for now |
| Backend | **Cloudflare free plan.** A new Worker `workers/api` with D1, on `api.polishup.app`, laid out like `workers/tts` |
| Email | **Resend** free tier (100 a day, 3,000 a month), called with `fetch`: login codes, the trial reminder, and the contact list (§10). Cloudflare's Email Service needs Workers Paid to send |
| Email list | Every user is a Resend contact tagged by plan (beta, trialing, monthly, annual, lifetime), moved when the plan changes and taken off the plan segments when it ends. **Marketing email only with explicit opt-in** (an unticked checkbox at sign-in; Polish law requires prior consent), stored with a timestamp in D1 |
| Gating | On the client only (static export): bypassable, and that is accepted. The server decides the entitlement; the client caches it for offline use |
| Event key | An answer is identified by `(t, card)`, as Phase 2 planned. `AnswerEvent` gets no new field, so the log format, `apply`/`replay` and the golden test do not change |
| Build | Several agents in parallel. The API contract (§4) comes first; each workstream (§16) depends only on it |

| Plan | EUR | USD | PLN | Billing |
| --- | --- | --- | --- | --- |
| Monthly | €6.99 | $7.99 | 29.99 zł | subscription, 3-day trial |
| Annual (default) | €49 | $54.99 | 199 zł | subscription, 3-day trial |
| Lifetime (until `LIFETIME_OFFER_UNTIL`) | €99 | $109 | 399 zł | one-time payment |
| Beta (while `BETA_OPEN`) | free | free | free | granted at account creation |

## 1. Shape ☑

```
polishup.app (static, Cloudflare Pages)          api.polishup.app (workers/api)
  lib/account.ts ── Bearer token, JSON ─────────▶  auth · sync · billing · account
  localStorage: log, outbox, account cache          D1 (users, events, entitlements …)
                                                    ├─ Resend (codes, trial reminder, contacts)
  Stripe Checkout / Portal ◀── redirect ──────────  └─ Stripe API
  Stripe ── webhooks ──────────────────────────────▶ POST /billing/webhook
                                                    Cron: hourly reminders + list retries; daily clean-up
```

- No cookies. The session token goes in `Authorization: Bearer …`.
- `public/sw.js` never touches cross-origin requests other than the TTS Worker,
  and never touches POSTs, so API calls always go to the network.
- New env var `NEXT_PUBLIC_API_URL` (build time, like `NEXT_PUBLIC_TTS_URL`).
  **Not set → accounts, sync and the paywall are off**: dev, tests and previews
  without it behave as today.

## 2. `workers/api` layout ☑

Same layout as `workers/tts`: own `package.json` (`dev`, `deploy`, `test`,
`typecheck`), `wrangler.toml`, `tsconfig.json`, `vitest.config.ts`, `README.md`,
`src/`, `test/`. Excluded from the root tsconfig and vitest.

- `src/index.ts`: `export default { fetch: handle, scheduled }`, with
  `export async function handle(request, env, ctx)` so tests call it directly.
- `src/contract.ts`: request and response types, error codes, plan and currency
  enums. **Types and constants only, no runtime imports.** The client imports it
  with `import type` (as `scripts/audio` imports `workers/tts/src/text.ts`).
- `src/auth.ts`, `src/sync.ts`, `src/account.ts`, `src/billing.ts` (routes),
  `src/stripe.ts` (the thin Stripe module, §9.1), `src/entitlement.ts`,
  `src/list.ts` (contact list, §10), `src/email.ts` (Resend send),
  `src/cron.ts`, `src/db.ts` (SQL helpers), `src/cors.ts`.
- `migrations/0001_init.sql` …, applied with `wrangler d1 migrations apply`.
- CORS: Origin allow-list from `ALLOWED_ORIGINS` (exact match:
  `https://polishup.app`, `http://localhost:3000`) plus `ALLOWED_ORIGIN_SUFFIX`
  (`.polish-exercises.pages.dev`, for previews). Methods `GET, POST, DELETE,
  OPTIONS`; headers `Content-Type, Authorization`; `Access-Control-Max-Age:
  86400`; `Vary: Origin`. `/billing/webhook` and `/email/unsubscribe` have no
  CORS and no Origin check.
- Bindings: `DB` (D1), `AUTH_IP_LIMITER` and `VERIFY_IP_LIMITER` (rate-limit
  bindings, as `MISS_LIMITER` in `workers/tts`).
- Vars: `ALLOWED_ORIGINS`, `ALLOWED_ORIGIN_SUFFIX`, `APP_URL`
  (`https://polishup.app`), `API_URL`, `EMAIL_FROM`, `BETA_OPEN` (`true` /
  `false`), `LIFETIME_OFFER_UNTIL` (ISO date, empty = no offer),
  `PRICE_MONTHLY`, `PRICE_ANNUAL`, `PRICE_LIFETIME` (Stripe Price ids),
  `RESEND_SEGMENTS` (JSON: list name → Resend segment id, §10).
- Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`,
  `CODE_PEPPER` (random, hashes login codes), `UNSUB_SECRET` (signs
  unsubscribe links).

Free-plan limits that matter: 100,000 requests a day, 10 ms CPU and 50
subrequests per request (the cron included), D1 5 M rows read and 100,000 rows
written a day, 500 MB per database. A first upload of 5,000 answers writes
5,000 rows (plus index writes), so uploads go in batches (§6) and the beta
scale fits easily.

## 3. D1 schema ☑

Times are ms since epoch (INTEGER). Ids are random (`crypto.randomUUID()`).

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,          -- lower-cased, trimmed
  created_at INTEGER NOT NULL,
  stripe_customer_id TEXT UNIQUE,      -- set at first checkout
  trial_used INTEGER NOT NULL DEFAULT 0,
  first_sync_at INTEGER,               -- set by the first POST /sync
  base TEXT,                           -- JSON: the replay start (§7), or NULL
  reminder_sent_at INTEGER,            -- trial reminder (§11)
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  marketing_consent_at INTEGER,        -- when it was last given or withdrawn
  marketing_consent_source TEXT,       -- signin | settings | unsubscribe
  list_synced TEXT,                    -- what Resend has: "<segment>|<0/1 subscribed>", NULL = nothing
  list_dirty INTEGER NOT NULL DEFAULT 0, -- 1 = Resend must be updated (§10)
  list_attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX users_list_dirty ON users(list_dirty) WHERE list_dirty = 1;

CREATE TABLE login_codes (
  email TEXT PRIMARY KEY,              -- one live code per email
  code_hash TEXT NOT NULL,             -- SHA-256(pepper + email + code), hex
  expires_at INTEGER NOT NULL,         -- sent + 10 min
  attempts INTEGER NOT NULL DEFAULT 0, -- max 5
  sent_at INTEGER NOT NULL,
  sends_window_start INTEGER NOT NULL, -- per-email send limits (§4.6)
  sends_in_window INTEGER NOT NULL,
  sends_today INTEGER NOT NULL,
  sends_day TEXT NOT NULL              -- UTC "2026-10-10"
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,         -- SHA-256 of the token, hex
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,       -- updated at most once a day
  expires_at INTEGER NOT NULL          -- sliding: last use + 180 days
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, -- the sync cursor
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  t INTEGER NOT NULL,
  card TEXT NOT NULL,
  e TEXT NOT NULL,                     -- the whole AnswerEvent as JSON
  UNIQUE (user_id, t, card)
);
CREATE INDEX events_user_seq ON events(user_id, seq);

CREATE TABLE user_data (                -- last write wins per key (§6)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,                   -- "settings" | "profile"
  value TEXT NOT NULL,                 -- JSON
  updated_at INTEGER NOT NULL,         -- client clock
  PRIMARY KEY (user_id, key)
);

CREATE TABLE entitlements (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT,                           -- monthly | annual | lifetime | beta | NULL
  status TEXT NOT NULL,                -- §5 states
  until INTEGER,                       -- access end; NULL = lifetime / beta / none
  trial_end INTEGER,
  stripe_subscription_id TEXT,
  stripe_payment_intent_id TEXT,       -- lifetime purchase (for refunds and disputes)
  currency TEXT,                       -- eur | usd | pln
  updated_at INTEGER NOT NULL
);

CREATE TABLE stripe_events (            -- webhook de-duplication
  id TEXT PRIMARY KEY,                 -- evt_…
  type TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE TABLE counters (                 -- global daily caps (email sends)
  key TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL,
  PRIMARY KEY (key, day)
);
```

- `ON DELETE CASCADE` needs `PRAGMA foreign_keys = ON` (on by default in D1);
  account deletion also deletes explicitly, to be safe.
- The event is stored whole in `e`, so a field added to `AnswerEvent` later
  syncs without a migration.

## 4. API contract ☑

Base URL `NEXT_PUBLIC_API_URL` (`https://api.polishup.app`). JSON in and out,
`Content-Type: application/json`. Authenticated calls send
`Authorization: Bearer <token>`. Every error is
`{ "error": "<code>", "message": "<English text>" }`, plus the extra fields
named below.

### 4.1 Shared types

```ts
type Plan = "monthly" | "annual" | "lifetime";      // what can be bought
type EntitlementPlan = Plan | "beta";
type Currency = "eur" | "usd" | "pln";
type EntitlementStatus =
  "none" | "trialing" | "active" | "past_due" | "canceling" | "lifetime" | "beta";

type Entitlement = {
  status: EntitlementStatus;
  plan: EntitlementPlan | null;
  access: boolean;          // may practise now
  until: number | null;     // access end (ms); null for lifetime, beta and none
  trialEnd: number | null;
  trialUsed: boolean;       // false → checkout offers the 3-day trial
  checkedAt: number;        // server time of this answer
};

type User = {
  id: string;
  email: string;
  createdAt: number;
  marketingConsent: boolean;
};

type PublicConfig = {
  betaOpen: boolean;
  lifetimeOfferUntil: number | null;  // null or past = no Lifetime
  currency: Currency;                 // suggested from request.cf.country:
                                      // PL → pln, euro area → eur, else usd
};

type Stamped<T> = { value: T; updatedAt: number };
```

### 4.2 Endpoints

| Method, path | Auth | Request | 200 response | Errors |
| --- | --- | --- | --- | --- |
| `GET /health` | – | – | `{ ok: true }` | – |
| `GET /config` | – | – | `PublicConfig` (cache 5 min) | – |
| `POST /auth/start` | – | `{ email }` | `{ ok: true }` (also when the email is unknown: no account enumeration) | 400 `invalid_email`, 429 `rate_limited` `{ retryAfter }` (seconds), 503 `email_unavailable` |
| `POST /auth/verify` | – | `{ email, code, marketingConsent?: boolean }` | `{ token, user: User, isNew: boolean, entitlement: Entitlement }` | 400 `invalid_code` `{ attemptsLeft }`, 410 `code_expired` (also: no code, or 5 attempts used), 429 `rate_limited` |
| `POST /auth/signout` | ✓ | – | `{ ok: true }` (deletes this session) | 401 |
| `GET /me` | ✓ | – | `{ user: User, entitlement: Entitlement, config: PublicConfig }` | 401 |
| `POST /sync` | ✓ | `SyncRequest` (§6) | `SyncResponse` (§6) | 400 `bad_request`, 401, 413 `too_large` (more than 500 events) |
| `POST /account/consent` | ✓ | `{ marketing: boolean }` | `{ user: User }` | 401 |
| `GET /account/export` | ✓ | – | `{ user, entitlement, settings, profile, events: AnswerEvent[] }` (GDPR access and portability) | 401 |
| `DELETE /account` | ✓ | – | `{ ok: true }` (§12) | 401, 502 `stripe_error` (nothing deleted; try again) |
| `POST /billing/checkout` | ✓ | `{ plan: Plan, currency: Currency }` | `{ url }` (Stripe Checkout) | 409 `already_subscribed` (has access; a subscriber may still buy Lifetime), 409 `has_lifetime_or_beta`, 410 `offer_ended` (Lifetime after `LIFETIME_OFFER_UNTIL`), 400 `bad_request` |
| `POST /billing/refresh` | ✓ | – | `{ entitlement }` (re-reads the customer's subscriptions and Lifetime payment from Stripe; same code path as the webhook; for the return from checkout) | 401 |
| `POST /billing/portal` | ✓ | – | `{ url }` (Customer Portal, return to `/billing`) | 409 `no_customer` |
| `POST /billing/webhook` | Stripe signature | raw body | `{ received: true }` | 400 `bad_signature` |
| `GET /email/unsubscribe?u=&s=` | signed link | – | a small HTML page with an "Unsubscribe" button that POSTs `confirm=1` (mail scanners open links, so GET changes nothing) | 400 `bad_link` |
| `POST /email/unsubscribe?u=&s=` | signed link | `List-Unsubscribe=One-Click`, or `confirm=1` from the button | `{ ok: true }` (RFC 8058 one-click), or the HTML page "You are unsubscribed" | 400 `bad_link` |

- `marketingConsent` at verify: `true` sets consent (source `signin`); `false`
  or missing never withdraws an existing consent.
- 401 is always `{ error: "unauthorized" }`: missing, unknown or expired token.
  The client then drops the token and keeps the local data.
- 500 is `{ error: "internal" }`. No stack traces in responses.

### 4.3 Codes

- 6 digits from `crypto.getRandomValues`, zero-padded. Stored hashed as
  `SHA-256(CODE_PEPPER + email + code)`; compared in constant time.
- Valid 10 minutes, 5 attempts. A new send replaces the old code.
- A correct code deletes the row, creates the user if needed, creates a session
  and returns the token (32 random bytes, base64url). Only its hash is stored.
- **A new user created while `BETA_OPEN` is `true` gets the `beta` entitlement
  in the same D1 batch.** That is the only place `beta` is granted.
- Email: subject "Your PolishUp code: 123456", the code in large type, "valid
  for 10 minutes", and "If you did not ask for it, ignore this email". Plain
  text and simple HTML. Sender from `EMAIL_FROM`. Transactional: no consent
  needed, no unsubscribe link.

### 4.4 Sessions

- Sliding expiry: 180 days after the last use. `last_used_at` and `expires_at`
  are written at most once a day per session, to save D1 writes.
- Any number of sessions per user (phone, laptop, the PWA and Safari on iOS).

### 4.5 Plans and currency on the client

`lib/plans.ts` holds the plans and prices of the table above, for display (the
landing page is static, so it cannot ask the API at build time). The Worker
maps a plan to `PRICE_*`. The owner keeps the Stripe prices equal to
`lib/plans.ts`. Whether Lifetime shows and whether the beta is open come from
`GET /config` at run time.

### 4.6 Rate limits

| What | Limit | Where |
| --- | --- | --- |
| `POST /auth/start` per IP | 5 a minute | `AUTH_IP_LIMITER` binding |
| `POST /auth/start` per email | 1 a minute, 5 per 15 minutes, 10 a day | `login_codes` row |
| Emails, all users | per UTC day (Resend allows 100): `email_new` 50 (codes to addresses without an account), `email_known` 30 (codes to accounts), `email_reminder` 20 (trial reminders); `EMAIL_BUDGETS` in `src/email.ts` | `counters` (key, UTC day) → 503 `email_unavailable` |
| `POST /auth/verify` per IP | 10 a minute | `VERIFY_IP_LIMITER` binding |
| `POST /auth/verify` per code | 5 attempts | `login_codes.attempts` |
| `POST /sync` | 500 events and 1 MB per request (streamed, cut off past the cap); webhook body 256 KB | handler |

Resend contact calls do not count toward the 100 emails a day, but its API
allows about 2 requests a second; list updates are spread out (§10.2).

## 5. Entitlement ☑

One row per user, written by the beta grant (§4.3) or derived from Stripe
(webhooks and `/billing/refresh`). The client never decides it, only caches it.

| Status | When (Stripe) | `access` | `until` |
| --- | --- | --- | --- |
| `none` | no purchase, or ended: canceled, unpaid, incomplete, incomplete_expired; Lifetime refunded, or disputed and not won | no | null |
| `trialing` | subscription `trialing` | yes | trial end |
| `active` | subscription `active`, not canceling | yes | item `current_period_end` |
| `past_due` | subscription `past_due` (Stripe retries the card; its dunning settings end it after the last retry) | yes, grace | period end + 7 days |
| `canceling` | `active` or `trialing` with `cancel_at_period_end` | yes | period end, or trial end |
| `lifetime` | a paid Lifetime Checkout (`mode=payment`) | yes | null |
| `beta` | granted at account creation while `BETA_OPEN` | yes | null |

- Precedence: `beta` > `lifetime` > subscription states. A webhook never
  overwrites `beta` or `lifetime` with a subscription state (except a Lifetime
  refund or dispute, which drops `lifetime` back to what the subscriptions say).
- A subscriber who buys Lifetime: the webhook cancels the subscription at once
  (refund of the unused period: open point 3).
- `trial_used` is set when a subscription with a trial starts, so a second
  checkout by the same user has no trial. A new email can get a new trial; that
  is accepted.
- Every write that changes `plan` or `status` also sets `users.list_dirty = 1`
  (§10).
- **Client cache** (`polish.account.v1`): `{ token, email, entitlement }`.
  Access offline = `entitlement.access && now < max(until ?? ∞,
  checkedAt + 7 days)`. Beta and Lifetime work offline for ever; a monthly user
  keeps access offline until the period end, or 7 days after the last check if
  that is later. Refreshed with `GET /me` on app start, on `online`, on
  `visibilitychange` to visible, and after checkout.

## 6. Sync protocol ☑

What syncs: the answer log (`polish.log.v2`), `polish.settings.v2` (the goal
changes the streak) and the profile name (`polish.profile.v1`). What does not:
`polish.today.v1`, consent, the install card, sound, theme, configs (per device).

### 6.1 Client state

- `polish.outbox.v1`: events not yet on the server. `recordAnswer` appends each
  new event here while signed in (same write as the log). On first sign-in the
  outbox is the whole local log.
- `polish.sync.v1`: `{ cursor, settingsAt, profileAt }`. `cursor` is the
  highest server `seq` received. `saveSettings` and `saveProfile` set their
  `…At` to `Date.now()`. Existing keys keep their format.

### 6.2 Request and response

```ts
type SyncRequest = {
  cursor: number;                   // 0 on a new device
  events: AnswerEvent[];            // from the outbox, at most 500, oldest first
  settings?: Stamped<Settings>;     // sent when changed since the last sync
  profile?: Stamped<{ name: string }>;
  base?: Progress["base"];          // first sync only, see §7
};
type SyncResponse = {
  cursor: number;                   // new highest seq for this user
  events: AnswerEvent[];            // seq > request cursor, at most 1,000, by seq
  more: boolean;                    // true → call again with the new cursor
  settings: Stamped<Settings> | null;
  profile: Stamped<{ name: string }> | null;
  base: Progress["base"] | null;    // the user's replay start, if any
};
```

- Server: validate every event (same field rules as `lib/progress.ts`; unknown
  drills or verdicts rejected with 400), `INSERT OR IGNORE` in a D1 `batch()`,
  so a resent event is a no-op. Then return the events after the cursor,
  including the ones just pushed (the client ignores those by key).
- Settings and profile: **last write wins by `updatedAt`**. The server keeps the
  newer one and always returns its current value; the client adopts it when its
  `updatedAt` is newer than the local one.
- The client clears from the outbox exactly the events it pushed, only after a
  200. It loops while `more` or the outbox is not empty.

### 6.3 Merge and replay

`lib/sync.ts`, pure, unit-tested:

- `mergeLogs(local, pulled)`: union by key `(t, card)`, sorted by `t` (then
  `card` for a stable order).
- Then always `replay(merged, base)` and write the log and the cache. SM-2 is
  path-dependent, so pulled events are **never** applied one by one with
  `apply`.
- Same events in any arrival order → the same `Progress` (tested).

### 6.4 When the client syncs

After sign-in; on app start; after each finished session (`Runner`); on
`online`; on `visibilitychange` to hidden (`fetch` with `keepalive`). At most
once per 30 seconds except after a session. A failed sync is silent and
retried; practice never waits for it.

### 6.5 Compaction

The server keeps the whole log. Local compaction (`COMPACT_AT` 20,000, keep
10,000) stays, with one rule: **events still in the outbox are never folded
into `base`**. An event pulled from another device that is older than the local
`base` is replayed after `base`, so that device's SM-2 state can drift slightly.
That is a known limit; at 20,000 answers it is years away for most learners.

## 7. First sign-in of an existing learner ☑

1. Sign in. The outbox becomes the whole local log.
2. First `POST /sync` with `cursor: 0`. If the local cache has a `base` (v1
   counts from `migrateV1`, or a compaction), it is sent as `base`. The server
   stores it in `users.base` **only if it has none**; first device wins.
3. The response brings the events from other devices (none for a new account)
   and the server `base`. The client merges and replays from the server `base`.
4. A second device that had its own local progress before signing in: its log
   is uploaded and merged like any other. Its own `base` is dropped if the
   server already had one (v1 counts are the only thing lost, and only on a
   second pre-account device). Shown once: "Your progress on this device was
   merged into your account."
5. Settings and profile: the first device's values win only if newer
   (`updatedAt`); a local value with no `…At` counts as 0, so the account's
   value wins on a second device.

Signing out keeps the local data (it stays on this device) and clears the token,
outbox, cursor and cached entitlement.

## 8. Beta and the paywall switch ☑

- `BETA_OPEN=true` (now): `/signin` creates the account with `beta`; the gate
  (§13.1) sends a signed-out learner to `/signin` and nowhere else. No plan
  picker, no card, no trial. Learners who practised before accounts existed
  sign in and keep their progress (§7).
- The owner closes the beta by setting `BETA_OPEN=false` (`wrangler.toml` var,
  then deploy; no client build needed). From then on a new account starts with
  `none`, and the trial and paywall flow (§9.3) applies. Existing `beta` rows
  are never touched.
- `GET /config` tells the client which mode it is in, so the landing page, the
  plan picker and `/billing` change copy without a rebuild.
- `/billing` and `/profile` show "Beta: Pro free, thank you" for `beta` users.
  They cannot start a checkout (409).

## 9. Billing (Stripe Managed Payments) ☑

### 9.1 The Stripe module

`workers/api/src/stripe.ts`, thin, so routes and D1 code never touch the
Stripe SDK directly:

```ts
createCheckout(o: { user: User; customerId: string | null; plan: Plan;
  currency: Currency; trial: boolean }): Promise<{ url: string; customerId: string }>;
createPortalUrl(customerId: string): Promise<{ url: string }>;
verifyWebhook(rawBody: string, signature: string): Promise<Stripe.Event>;
/** Re-fetches what an event is about and returns the user's derived entitlement. */
entitlementFor(customerId: string): Promise<DerivedEntitlement>;
cancelNow(subscriptionId: string): Promise<void>;
deleteCustomer(customerId: string): Promise<void>;
```

- `stripe` npm package, `Stripe.createFetchHttpClient()`, API version
  `2025-03-31.basil` or later (Managed Payments needs it). In basil,
  `current_period_end` is on the subscription items.
- `entitlementFor` lists the customer's subscriptions and its paid, unrefunded
  Lifetime Checkout Sessions, and applies the §5 table. The webhook and
  `/billing/refresh` both call it, then `entitlement.ts` writes the row
  (respecting the precedence of `beta` and `lifetime`).

### 9.2 Stripe objects and Checkout Session

- Three Products (tax code `txcd_10103000`, or what Managed Payments requires).
  Each has one Price in EUR with `currency_options` for USD and PLN and
  `tax_behavior` per currency. Monthly and Annual: recurring. Lifetime: one-time.
- Checkout Session params:

| Param | Monthly / Annual | Lifetime |
| --- | --- | --- |
| `mode` | `subscription` | `payment` |
| `line_items` | `[{ price: PRICE_*, quantity: 1 }]` | same |
| `currency` | from the request | same |
| `customer` | `stripe_customer_id`, created on first checkout with `email` and `metadata.user_id` | same |
| `client_reference_id`, `metadata.user_id`, `metadata.plan` | user id, plan | same |
| `subscription_data.trial_period_days` | `3` unless `trial_used` | – |
| `subscription_data.metadata.user_id` | user id | – |
| `payment_intent_data.metadata.user_id` | – | user id |
| `managed_payments[enabled]` | `true` | `true` |
| `success_url` | `APP_URL/billing?checkout=done` | same |
| `cancel_url` | `APP_URL/plans` | same |

- Not allowed with Managed Payments: `automatic_tax`, `tax_id_collection`,
  `payment_method_types`, `invoice_creation`, `adaptive_pricing`. Adaptive
  Pricing is forced on, but our `currency_options` win.
- Lifetime is refused with 410 `offer_ended` when `now ≥ LIFETIME_OFFER_UNTIL`
  or it is empty. There is no public Payment Link.
- Customers can also cancel at link.com, so **webhooks are the source of
  truth**. Subscriptions cannot be moved into Managed Payments later, so it is
  on before the first live sale.
- Fees: about 1.5% + 1 zł card fee (EEA) + 3.5% Managed Payments, probably
  + 0.7% Billing.

### 9.3 Webhooks

Events: `checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.paid`, `invoice.payment_failed`, `charge.refunded`,
`charge.dispute.created`, `charge.dispute.closed`. A dispute carries no
customer, so its user is found by the Lifetime payment intent. An open or lost
dispute ends Lifetime; a won one gives it back.

- Read the raw body with `request.text()`; `verifyWebhook` uses
  `constructEventAsync(body, sig, secret, undefined,
  Stripe.createSubtleCryptoProvider())`.
- De-duplicate: `INSERT OR IGNORE INTO stripe_events`; if the row exists,
  return 200 at once.
- Do not trust the payload or the order: find the user (`metadata.user_id`, or
  by `stripe_customer_id`), call `entitlementFor`, write the row, set
  `list_dirty`, then try the list update (§10.2) in `ctx.waitUntil`.
- Unknown user → 200 and a log line (an account deleted earlier).
- `customer.subscription.trial_will_end` fires at once for a 3-day trial, so it
  is not subscribed; the reminder is the cron job (§11).

### 9.4 The flow after the beta

1. Landing "Start free trial" → `/today`.
2. Gate (§13.1): no token → `/signin?next=/today`.
3. `/signin`: email, the unticked marketing checkbox (§10.3) → "Send code" →
   one input with `autocomplete="one-time-code"`, `inputmode="numeric"` →
   verified → token saved → `GET /me`.
4. Access (trial, paid, Lifetime or beta) → `next`. No access →
   `/plans?next=/today`.
5. `/plans`: Annual highlighted and pre-selected, Monthly, and Lifetime while
   the offer runs (with its end date); currency switch (default from
   `/config`); "3 days free, then €49 a year. Cancel any time before <date>
   and you pay nothing." → `POST /billing/checkout` → Stripe Checkout.
6. Back on `/billing?checkout=done`: `POST /billing/refresh`, then poll
   `GET /me` every 2 s for up to 30 s until `access`. Then "You're in" → `/today`.
7. iOS PWA: Checkout may open in a Safari view and return there. The installed
   app refreshes `/me` on `visibilitychange`, so it unlocks when the learner
   comes back to it.

While the beta is open, step 3 ends the flow: the new account has `beta`.

## 10. Email list (Resend contacts) ☑

### 10.1 What the list holds

- Every user is a Resend contact (email, `user_id`, `plan`, `unsub_url`
  properties). `unsubscribed` = **not** `marketing_consent`, so broadcasts only
  reach learners who opted in.
- One segment per list name, ids in `RESEND_SEGMENTS`: `beta`, `trialing`,
  `monthly`, `annual`, `lifetime`, `former` (plan ended: `none` after having
  had a plan). A contact is in exactly one segment; `past_due` and `canceling`
  stay in their plan's segment.
- Check at build time which Resend API the account has (Contacts + Segments,
  or the older Audiences); with Audiences, one audience per list name and the
  same rules.

### 10.2 Keeping it in step (`src/list.ts`)

- Source of truth is D1. Any change to the plan, the status or the consent sets
  `users.list_dirty = 1` in the same D1 write.
- After the D1 write, `ctx.waitUntil(syncContact(user))`: upsert the contact,
  move it to the right segment, set `unsubscribed`; on success store
  `list_synced`, clear `list_dirty` and `list_attempts`. Idempotent: running it
  twice gives the same Resend state. It compares with `list_synced` and skips
  calls that change nothing.
- A failure only leaves `list_dirty = 1` (and bumps `list_attempts`). It never
  blocks sign-in, sync, checkout or a webhook response.
- The hourly cron retries dirty users, at most 4 per run (each takes up to 4
  Resend calls; the free plan allows 50 subrequests and Resend about 2 calls a
  second). After 24 failed attempts it logs and stops retrying that user until
  the next change.
- Account deletion removes the contact (§12).

### 10.3 Consent and unsubscribe

- `/signin` has an **unticked** checkbox: "Send me occasional tips and news
  about PolishUp. You can unsubscribe any time." Polish law requires prior,
  explicit consent for commercial email; it is never pre-ticked and never a
  condition of the account.
- Stored in `users`: `marketing_consent`, `marketing_consent_at`,
  `marketing_consent_source` (`signin` / `settings` / `unsubscribe`). The
  consent text is versioned in `contract.ts` (`CONSENT_TEXT_V1`) and the
  version goes into the source, e.g. `signin:v1`.
- `/settings` shows a toggle (`POST /account/consent`).
- Unsubscribe link: `API_URL/email/unsubscribe?u=<user id>&s=<HMAC-SHA256(UNSUB_SECRET, user id)>`,
  stored on the contact as `unsub_url` and used in every broadcast template,
  plus `List-Unsubscribe` and `List-Unsubscribe-Post` headers. It sets
  `marketing_consent = 0` (source `unsubscribe`) in D1 and marks the list dirty;
  the contact becomes `unsubscribed` on the next sync.
- If a learner unsubscribes through Resend's own link instead, Resend's
  `contact.updated` webhook is not wired in this phase; templates must use
  `unsub_url` (open point 5).
- Transactional emails need no consent and carry no unsubscribe link: login
  codes, the trial reminder, Stripe's receipts and invoices.

## 11. Trial reminder email ☑

- Cron Triggers `crons = ["0 * * * *", "30 3 * * *"]`: hourly reminders and list retries, daily clean-up (the free plan allows Cron
  Triggers, 5 per account: check in the dashboard).
- Sends to each user with `status = 'trialing'`, `trial_end - now ≤ 36 h` and
  `reminder_sent_at IS NULL`; then sets `reminder_sent_at`. Counts in
  `counters`.
- Text: your trial ends on <date>, then <price> for <plan>; manage or cancel at
  `APP_URL/billing`. No marketing. Transactional.
- Turn off Stripe's own trial reminder emails if they would duplicate it.
- The hourly run also retries the list (§10.2). The daily run deletes expired
  `login_codes` and `sessions`, `stripe_events` older than 30 days and old
  counters.

## 12. Account deletion ☑

`DELETE /account`, from `/settings` after typing the email to confirm:

1. Cancel any live subscription at once (`cancelNow`, no refund). If Stripe
   fails, stop and return 502: nothing is deleted.
2. Delete the Stripe Customer (`deleteCustomer`). Payments and invoices stay at
   Stripe for tax records.
3. Delete the Resend contact. A failure here is logged, not fatal (the user row
   is gone, so the owner removes it by hand from the log).
4. Delete the user's rows: `sessions`, `events`, `user_data`, `entitlements`,
   `login_codes` (by email), `users`.
5. The client signs out and asks whether to also delete the data on this
   device (`ClearLocalData`).

The UI warns that Lifetime and beta access are lost too. "Delete data on this
device" (existing) now also signs out, because the token is a `polish.*` key.

## 13. Client ☑

### 13.1 Gate

- `components/AccessGate.tsx` wraps `Runner` in `app/today/TodayClient.tsx` and
  `app/practice/PracticeClient.tsx`, **before** the session is built. Until
  hydrated it renders nothing; no API URL → children; signed out →
  `/signin?next=…`; signed in, no access (cached entitlement, §5) →
  `/plans?next=…`. While the beta is open a new account has access, so
  `/plans` is never reached.
- Free crossings into the gate: guide "Practise" links (`PractiseLink`),
  `SiteHeader` "Start", `StartButton`, `SampleQuestion` → `/today`, manifest
  `start_url` `/today`. All keep working; the gate handles them.
- `/learn`, `/progress`, `/profile`, `/settings`, `/billing` stay open (they
  show local data and the account). `/learn` stays in the sitemap.

### 13.2 New modules

| File | Content |
| --- | --- |
| `lib/plans.ts` | `PLANS` (monthly, annual, lifetime), prices per currency, `formatPrice`, tax note per currency |
| `lib/account.ts` | API client (`config`, `start`, `verify`, `me`, `sync`, `setConsent`, `checkout`, `refreshBilling`, `portal`, `exportData`, `deleteAccount`, `signOut`); typed from `workers/api/src/contract.ts`; token and cached entitlement in `polish.account.v1`; `hasAccess(entitlement, now)` |
| `lib/sync.ts` | `mergeLogs`, the sync loop, outbox and cursor handling (§6) |
| `lib/storage.ts` | outbox append in `recordAnswer`, no compaction of outbox events, `…At` stamps in `saveSettings` / `saveProfile`, `useAccount` hook |
| `app/(site)/signin/` | email + marketing checkbox → code (noindex) |
| `app/(site)/plans/` | plan picker (noindex) |

### 13.3 Pages to change

- `app/(app)/billing/page.tsx`: current plan ("Beta: Pro free", "Lifetime",
  Monthly / Annual with status and next charge or end date), "Manage billing"
  (Portal), plan picker when there is no plan, the `?checkout=done` return
  (§9.4).
- `app/(app)/profile/`: the "Free · beta" chip → the plan; "this device" copy →
  "your account" when signed in; the email.
- `app/(app)/settings/`: account section (email, sign out, email tips toggle,
  export, delete account).
- `components/AppShell.tsx`: sidebar chip "Free · beta" → plan or "Sign in".
- `app/(site)/page.tsx`: `PERKS` and `#pricing` from `lib/plans.ts`. Static
  copy shows Monthly and Annual with "3-day free trial"; a small client part
  reads `/config` and, while the beta is open, says "Free during the beta:
  sign in to start", and shows Lifetime while the offer runs.
- `lib/site.ts`: `/signin`, `/plans` in `NOINDEX`.

## 14. Analytics ☑

New events in `EventProps` and `EVENT_SCHEMA` (enum values and counts only, rule 12):

| Event | Props |
| --- | --- |
| `sign_in_started` | – |
| `signed_in` | `kind`: new / returning |
| `paywall_shown` | `from`: today / practice |
| `checkout_started` | `plan` (monthly / annual / lifetime), `currency` |
| `checkout_completed` | `plan`, `currency` (client, when `/billing` sees access) |
| `account_deleted` | – |

Never `posthog.identify` with the email or the user id, and never send the
marketing consent: the privacy policy promises no link to an email. Revenue and
trial conversion are read in Stripe.

## 15. Privacy policy and docs ◐

- `/privacy` is rewritten: it now says there are no accounts and nothing leaves
  the device. New content: the account (email), the synced log, settings and
  name; processors Cloudflare (D1, Workers), Stripe (merchant of record, payments
  and VAT), Resend (login codes, trial reminder, and the contact list with the
  plan); the marketing list: only with consent, how to withdraw it (link in
  every email, toggle in settings), and that every account is a contact marked
  unsubscribed without consent (or only consenting users, per open point 4);
  legal bases: contract (Art. 6(1)(b)) for the account, sync and transactional
  email, consent (Art. 6(1)(a)) for marketing email, legal obligation for tax
  records; retention (until deletion; sessions 180 days after last use; Stripe
  keeps payment records as the law requires); export and delete account; the
  new analytics events. New `LAST_UPDATED`. **The owner approves it again
  before launch.**
- Docs per the AGENTS.md table: codebase map (`workers/api`, `lib/account.ts`,
  `lib/sync.ts`, `lib/plans.ts`, `AccessGate`, `/signin`, `/plans`), rules
  (gate off without `NEXT_PUBLIC_API_URL`; the event key; outbox and
  compaction; marketing email only with consent), `README.md` (routes, env vars,
  the analytics event table, an Accounts and billing section),
  `workers/api/README.md` (endpoints, vars, `BETA_OPEN` and
  `LIFETIME_OFFER_UNTIL` switches), this file, and `plans/ROADMAP.md` (status
  row; the Phase 4 section, which still says "Lifetime is for beta users only"
  and "VAT is on the owner … unless"; the "Later" `/billing` item goes).
- Separate small fix: `workers/tts` `ALLOWED_ORIGINS` lacks
  `https://polishup.app`.

Done: `/privacy` rewritten (date 10 October 2026), `AGENTS.md`, `README.md`,
`workers/api/README.md`, this file and `plans/ROADMAP.md` updated; the TTS
Worker's `ALLOWED_ORIGINS` has `https://polishup.app` (takes effect on its next
deploy). Left: **the owner approves the new `/privacy`**. It describes the
accounts-on world, so it should go live together with `NEXT_PUBLIC_API_URL`.

## 16. Workstreams for parallel agents

**Step 0, before anything else:** `workers/api/src/contract.ts` written from §4
and reviewed. Every workstream below depends only on it, and on §3 for A and B.

| # | Piece | Files | Depends on |
| --- | --- | --- | --- |
| A | Worker core: scaffold, CORS, D1 schema and migrations, `/config`, auth (§4.3–4.6) with the beta grant, sessions, `/me`, `/sync`, `/account/*` (consent, export, delete minus Stripe), Resend send client (`email.ts`), cron skeleton and clean-up | `workers/api/` except `src/billing.ts`, `src/stripe.ts`, `src/entitlement.ts`, `src/list.ts` | contract |
| B | Worker billing and list: `stripe.ts`, `/billing/*`, webhook, entitlement derivation and precedence (§5), Lifetime offer check, trial reminder, Stripe part of deletion; **the email list** (`list.ts`: contact upsert, segments, `list_dirty` and cron retries, `/email/unsubscribe` with signed links, contact removal on deletion) | `workers/api/src/billing.ts`, `src/stripe.ts`, `src/entitlement.ts`, `src/list.ts`, their tests | contract, §3, A's `email.ts` interface (Resend `fetch` wrapper); merges with A's router (one line per route) |
| C | Client logic: `lib/account.ts`, `lib/sync.ts`, `lib/plans.ts`, outbox and stamps in `lib/storage.ts`, `hasAccess`, analytics schema | `lib/` | contract |
| D | UI: `AccessGate`, `/signin` (with the consent checkbox), `/plans`, `/billing`, profile, settings, AppShell, landing pricing with the `/config` part, `NOINDEX` | `app/`, `components/` | contract, C's exported function names (stub them until C lands) |
| E | Privacy policy draft and docs | `app/(site)/privacy/page.tsx`, `README.md`, `AGENTS.md`, `workers/api/README.md`, `plans/` | this spec; final pass after A–D |

Order: 0 → A, B, C in parallel → D (can start with C's stubs) → E → owner
setup (§18) → end-to-end test in Stripe test mode → launch with `BETA_OPEN=true`.

## 17. Testing ◐

- `workers/api` vitest, bindings mocked as in `workers/tts`: D1 as a small
  adapter over `node:sqlite` running the real migrations; rate limiters, Resend
  and Stripe (`fetch`) mocked with recorded fixtures. Cases: code flow (wrong,
  expired, 5 attempts, replaced code, enumeration-safe start), limits, token
  expiry, CORS (allowed, suffix, refused), beta grant with `BETA_OPEN` true and
  false (and existing `beta` kept after closing), sync (idempotent resend,
  cursor paging, LWW, first-device `base`), every webhook type, duplicate and
  out-of-order webhooks, signature failure, the §5 table and precedence,
  Lifetime before and after the offer end, list sync (idempotent, segment moves,
  failure leaves it dirty, cron retry cap, never blocks the caller), consent at
  verify (never withdrawn by `false`), unsubscribe link (bad signature, GET and
  one-click POST), cron, delete.
- Root vitest: `mergeLogs` and replay give the same `Progress` in any order and
  with duplicates; outbox never compacted; `hasAccess` offline rules; gate
  redirects; analytics schema.
- **Golden snapshot unchanged.** No `data/` or builder change in this phase.
- End to end (owner + agent), Stripe test mode: `stripe listen --forward-to
  localhost:8787/billing/webhook`, test cards (success, 3-D Secure, decline),
  trial → active with a test clock, cancel in the Portal, Lifetime purchase and
  refund, delete account; with `BETA_OPEN=true` a new account gets Pro without
  checkout; contacts move between segments in Resend; sign in on two browsers
  and check progress merges.
- Gates as always: test, lint, build, tsc, plus `cd workers/api && npm test &&
  npm run typecheck`.

Done: the Worker and root unit tests above. Left: the end-to-end run in Stripe
test mode (needs the owner setup, §18).

## 18. Owner setup

1. **Stripe:** activate Managed Payments (before any live sale). Create the
   three Products and Prices (§9.2). Customer Portal: cancel, update card,
   switch Monthly ↔ Annual, invoices. Dunning: retries, then cancel. Webhook
   endpoint `https://api.polishup.app/billing/webhook` with the §9.3 events.
   Copy the price ids, the secret key and the signing secret. Do it all in
   test mode first.
2. **Resend:** account; add the sending domain (e.g. `mail.polishup.app`) and
   its SPF, DKIM and DMARC records in Cloudflare DNS; create an API key;
   create the six segments (§10.1) and copy their ids; broadcast templates use
   the contact's `unsub_url`. Create the contact properties `user_id`, `plan`
   and `unsub_url` first. The full checklist, as built, is in
   `workers/api/README.md` ("Owner setup").
3. **Cloudflare:** `wrangler d1 create polishup-api`, put its id in
   `wrangler.toml`, `wrangler d1 migrations apply --remote`; `wrangler secret
   put` for `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`,
   `CODE_PEPPER`, `UNSUB_SECRET`; set the vars (`BETA_OPEN=true`,
   `LIFETIME_OFFER_UNTIL`, `PRICE_*`, `RESEND_SEGMENTS`); `npm run deploy`;
   custom domain `api.polishup.app` on the Worker; check the cron trigger is
   listed.
4. **Pages:** `NEXT_PUBLIC_API_URL=https://api.polishup.app` for production; a
   test-mode Worker URL for previews, or none.
5. Approve the new `/privacy`. Tell the beta testers to sign in to keep their
   progress and get Pro free for good. Later: set `BETA_OPEN=false` and deploy
   the Worker to start charging.

## As built: deviations from this spec

- **Login codes (§4.3):** a correct code does not delete the `login_codes`
  row; it empties `code_hash` and sets `expires_at = 0`, so the per-email send
  limits (§4.6) still apply. The daily clean-up (03:30 UTC) deletes the row
  once the code has expired, the 15-minute window has passed and the UTC day is over.
- **CORS (§2):** a request whose `Origin` is not allowed gets **403** before any
  handler runs (the spec only said no CORS headers). Requests without `Origin`
  go through without CORS. Unknown routes answer 404 `not_found`.
- **Stripe API version (§9.1):** no explicit `apiVersion`; the Worker uses the
  one pinned by its `stripe` package, `2026-09-30.endive` (stripe 23.0.0),
  which is later than basil as required. Set the webhook endpoint to it.
- **Disputes (§5, §9.3):** a disputed Lifetime payment ends Lifetime unless
  every dispute on it was won (`won` or `warning_closed`, looked up with
  `disputes.list`); a won dispute restores Lifetime on `charge.dispute.closed`.
- **Unsubscribe (§4.2, §10.3):** `GET` only shows a page with a confirm button
  (it POSTs `confirm=1`); a bare POST is the RFC 8058 one-click. Consent
  sources are `signin:v1`, `settings:v1` and `unsubscribe`.
- **List (§10.1):** a post-beta account that never had a plan is a contact with
  `plan` `none` and no segment (not "exactly one segment").
- **Cron (§11):** two triggers. Hourly `0 * * * *`: at most 5 trial reminders
  (`CRON_MAX_REMINDERS`) and 4 list users (`CRON_MAX_LIST_USERS`), ≤ 45
  subrequests including D1. Daily `30 3 * * *`: the clean-up.
- **Email budgets (§4.6):** three daily counters instead of one 80 cap:
  `email_new` 50, `email_known` 30, `email_reminder` 20, so junk sign-ups can
  never block a known learner's code or a reminder.
- **Webhook (§9.3):** `stripe_events.processed_at` (NULL while in flight); a
  duplicate of an in-flight event gets **409** so Stripe retries it; a claim
  older than 5 minutes is taken over. Body capped at 256 KB.
- **Entitlement write (§5):** `entitlements.read_at` stores when the Stripe
  state was read; an older read never overwrites a newer one. The precedence
  `beta` > `lifetime` > subscription is enforced in the SQL.
- **Trial once per email (§5, §9.2):** table `trial_history(email_hash)`
  (peppered hash) survives account deletion, so a new account with the same
  email gets no second trial. Checkout also answers 409 `already_subscribed`
  when Stripe still has a live subscription for the customer.
- **Sync limits (§6):** `SYNC_MAX_PUSH` 500, `SYNC_MAX_PULL` 1,000. Unknown
  event fields are dropped before storing; `base` must be v2-shaped;
  `updatedAt` is clamped to at most now + 1 day. Bodies are read as a stream
  with a cap.
- **Rate limits (§4.6):** the IP limiters key IPv6 by its /64; a missing
  binding lets requests through and logs it.
- **Dev:** `DEV_LOG_EMAIL="true"` (only in `.dev.vars`) logs emails, code
  included, instead of sending them.
- **Checkout (§4.2):** `POST /billing/checkout`, `/billing/refresh` and
  `/billing/portal` also answer 502 `stripe_error` when Stripe fails.
- **Entitlement (§5):** a `paused` subscription counts as ended (`none`).
- **Client state (§6.1):** `polish.sync.v1` also holds `settingsSynced` /
  `profileSynced` (the stamp the server is known to hold), `joined` (a first
  sync since sign-in succeeded; cleared on sign-out) and `merged` (show the
  "progress merged" notice once, only when that first sync pushed local
  progress). Settings or a profile never stamped on a
  device are sent with `updatedAt` 1 (the server takes any stamp ≥ 0), so the
  account's value wins. New keys: `polish.apiConfig.v1` (`/config`, kept on
  sign-out) and, in sessionStorage, `polish.checkout.v1` (plan and currency of
  a checkout in progress, for `checkout_completed`).
- **Gate (§13.1):** before sending a signed-in learner without access to
  `/plans`, `AccessGate` asks `GET /me` once, so a stale cache does not bounce
  a learner who has just paid.

## Done when

- [ ] With `BETA_OPEN=true`: a new visitor goes landing → `/today` → sign-in →
  `/today` with Pro, and an existing learner keeps all progress.
- [ ] With `BETA_OPEN=false`: landing → `/today` → sign-in → plan → Checkout
  (trial) → `/today`, on a phone and on a desktop; earlier `beta` accounts
  still have Pro.
- [ ] Lifetime can be bought before `LIFETIME_OFFER_UNTIL` and is refused and
  hidden after it.
- [ ] The day-2 trial email arrives; cancelling in the Portal ends access at the
  trial end; a declined renewal goes `past_due` then `none`.
- [ ] Each contact is in the segment of its plan, moves on change, and is
  `unsubscribed` without consent; the unsubscribe link updates D1.
- [ ] Two devices on one account show the same streak, due cards and settings.
- [ ] The installed PWA unlocks after checkout and works offline with the
  cached entitlement.
- [ ] Delete account removes the D1 rows, the Stripe customer and the contact.
- [ ] The new `/privacy` is approved. All gates green; golden unchanged.

## Open points

1. `LIFETIME_OFFER_UNTIL`: which date?
2. USD tax-exclusive allowed under Managed Payments?
3. Lifetime bought during a subscription: refund the unused period?
4. List: every user (unsubscribed without consent) or only consenting users?
5. Wire Resend's `contact.updated` webhook too, or own unsubscribe link only?
6. Resend sender `mail.polishup.app` OK?
7. Offline grace 7 days OK?
8. Refund policy / EU 14-day withdrawal waiver: Stripe's default OK?
9. Turnstile on `/auth/start`? While `email_new` is spent, an unknown email gets 503 and a known one 200: a small account-enumeration leak.
