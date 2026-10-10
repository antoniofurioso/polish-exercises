/**
 * The API contract between the app and workers/api (plans/phase-4.md §4).
 * Types and constants only, no runtime imports: the app imports it with
 * `import type` (lib/account.ts), and the Worker's handlers are typed by it.
 *
 * `WireEvent`, `WireSettings` and `WireBase` mirror `AnswerEvent`, `Settings`
 * and `Progress["base"]` in lib/progress.ts. The Worker stores events whole and
 * validates only the fields below; lib/__tests__ checks the two stay assignable.
 */

export type Plan = "monthly" | "annual" | "lifetime";
export type EntitlementPlan = Plan | "beta";
export type Currency = "eur" | "usd" | "pln";
export type EntitlementStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceling"
  | "lifetime"
  | "beta";

export const PLANS: readonly Plan[] = ["monthly", "annual", "lifetime"];
export const CURRENCIES: readonly Currency[] = ["eur", "usd", "pln"];

export type Entitlement = {
  status: EntitlementStatus;
  plan: EntitlementPlan | null;
  /** May practise now. */
  access: boolean;
  /** Access end (ms); null for lifetime, beta and none. */
  until: number | null;
  trialEnd: number | null;
  /** false → checkout offers the 3-day trial. */
  trialUsed: boolean;
  /** Server time of this answer (ms). */
  checkedAt: number;
};

export type User = {
  id: string;
  email: string;
  createdAt: number;
  marketingConsent: boolean;
};

export type PublicConfig = {
  betaOpen: boolean;
  /** null or in the past = no Lifetime offer. */
  lifetimeOfferUntil: number | null;
  /** Suggested from request.cf.country: PL → pln, euro area → eur, else usd. */
  currency: Currency;
};

export type Stamped<T> = { value: T; updatedAt: number };

export type WireVerdict = "correct" | "diacritics" | "wrong";

export type WireEvent = {
  t: number;
  day: string;
  card: string;
  skill: string;
  verdict: WireVerdict;
  miss?: string;
  drill: string;
  case: string;
};

export type WireSettings = { goal: number; newPerDay: number };
export type WireProfile = { name: string };
/** `Progress["base"]`: stored as JSON; the Worker checks only `v: 2` and the four records. */
export type WireBase = Record<string, unknown>;

// ---- Requests and responses (§4.2) ----

export type AuthStartRequest = { email: string };
export type AuthVerifyRequest = { email: string; code: string; marketingConsent?: boolean };
export type AuthVerifyResponse = {
  token: string;
  user: User;
  isNew: boolean;
  entitlement: Entitlement;
};
export type MeResponse = { user: User; entitlement: Entitlement; config: PublicConfig };

export type SyncRequest = {
  /** Highest server seq received; 0 on a new device. */
  cursor: number;
  /** From the outbox, oldest first, at most SYNC_MAX_PUSH. */
  events: WireEvent[];
  settings?: Stamped<WireSettings>;
  profile?: Stamped<WireProfile>;
  /** First sync only (§7); kept only if the server has none. */
  base?: WireBase;
};
export type SyncResponse = {
  cursor: number;
  /** seq > request cursor, by seq, at most SYNC_MAX_PULL. */
  events: WireEvent[];
  /** true → call again with the new cursor. */
  more: boolean;
  settings: Stamped<WireSettings> | null;
  profile: Stamped<WireProfile> | null;
  base: WireBase | null;
};

export type ConsentRequest = { marketing: boolean };
export type ConsentResponse = { user: User };
export type ExportResponse = {
  user: User;
  entitlement: Entitlement;
  settings: Stamped<WireSettings> | null;
  profile: Stamped<WireProfile> | null;
  events: WireEvent[];
};
export type CheckoutRequest = { plan: Plan; currency: Currency };
export type UrlResponse = { url: string };
export type RefreshResponse = { entitlement: Entitlement };
export type OkResponse = { ok: true };

export type ErrorCode =
  | "bad_request"
  | "invalid_email"
  | "invalid_code"
  | "code_expired"
  | "rate_limited"
  | "email_unavailable"
  | "unauthorized"
  | "too_large"
  | "already_subscribed"
  | "has_lifetime_or_beta"
  | "offer_ended"
  | "no_customer"
  | "stripe_error"
  | "bad_signature"
  | "bad_link"
  | "not_found"
  | "internal";

export type ApiError = {
  error: ErrorCode;
  message?: string;
  /** invalid_code */
  attemptsLeft?: number;
  /** rate_limited, seconds */
  retryAfter?: number;
};

// ---- Limits and constants ----

/** Kept low for the 10 ms CPU budget of the free plan. lib/sync.ts must push at most this many. */
export const SYNC_MAX_PUSH = 500;
export const SYNC_MAX_PULL = 1000;
export const SYNC_MAX_BYTES = 1_000_000;
export const CODE_TTL_MS = 10 * 60_000;
export const CODE_MAX_ATTEMPTS = 5;
export const SESSION_TTL_MS = 180 * 86_400_000;
export const TRIAL_DAYS = 3;
export const PAST_DUE_GRACE_MS = 7 * 86_400_000;
export const OFFLINE_GRACE_MS = 7 * 86_400_000;

/** The marketing opt-in text at sign-in; its version goes into the consent source. */
export const CONSENT_TEXT_V1 =
  "Send me occasional tips and news about PolishUp. You can unsubscribe any time.";
export const CONSENT_VERSION = "v1";

/** Resend segment per list name (§10.1). */
export type ListName = "beta" | "trialing" | "monthly" | "annual" | "lifetime" | "former";
