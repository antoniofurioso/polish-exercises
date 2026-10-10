-- PolishUp API, initial schema (plans/phase-4.md §3).
-- Times are ms since epoch (INTEGER). Ids are random (crypto.randomUUID()).

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
CREATE INDEX sessions_expires ON sessions(expires_at);

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
  updated_at INTEGER NOT NULL,
  read_at INTEGER NOT NULL DEFAULT 0   -- when the Stripe state behind this row was read; older reads never overwrite
);
CREATE INDEX entitlements_trial ON entitlements(status, trial_end);
CREATE INDEX entitlements_pi ON entitlements(stripe_payment_intent_id);

CREATE TABLE stripe_events (            -- webhook de-duplication
  id TEXT PRIMARY KEY,                 -- evt_…
  type TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER                 -- NULL = in flight (or died: retried after 5 min)
);
CREATE INDEX stripe_events_received ON stripe_events(received_at);

CREATE TABLE counters (                 -- global daily caps (email sends)
  key TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL,
  PRIMARY KEY (key, day)
);
CREATE INDEX counters_day ON counters(day);

CREATE TABLE trial_history (            -- emails that had a trial; kept on account deletion (§9.2)
  email_hash TEXT PRIMARY KEY          -- SHA-256(CODE_PEPPER + normalised email), hex
);
