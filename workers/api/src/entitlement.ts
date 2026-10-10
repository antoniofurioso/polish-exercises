/**
 * Entitlement (plans/phase-4.md §5): the pure derivation from Stripe objects,
 * the D1 write with the precedence beta > lifetime > subscription, and the read
 * that answers the client. Stripe objects reach this file already reduced to
 * `SubInput` / `LifetimeInput` by stripe.ts, so it never touches the SDK.
 */
import {
  PAST_DUE_GRACE_MS,
  type Currency,
  type Entitlement,
  type EntitlementPlan,
  type EntitlementStatus,
  type Plan,
} from "./contract";
import type { Env } from "./env";

/** A subscription, reduced to what §5 needs. Times in ms. */
export type SubInput = {
  id: string;
  /** Stripe status: trialing, active, past_due, canceled, unpaid, incomplete… */
  status: string;
  cancelAtPeriodEnd: boolean;
  /** A scheduled cancellation (`cancel_at`), if any. */
  cancelAt: number | null;
  trialEnd: number | null;
  /** The item's `current_period_end` (basil and later). */
  periodEnd: number | null;
  priceId: string | null;
  /** `metadata.plan`, a fallback when the price id is unknown. */
  metaPlan: string | null;
  currency: string | null;
  created: number;
};

/** A paid Lifetime Checkout Session. */
export type LifetimeInput = {
  paymentIntentId: string | null;
  currency: string | null;
  created: number;
  /** Refunded or disputed. */
  revoked: boolean;
};

export type DerivedEntitlement = {
  status: Exclude<EntitlementStatus, "beta">;
  plan: Plan | null;
  until: number | null;
  trialEnd: number | null;
  subscriptionId: string | null;
  paymentIntentId: string | null;
  currency: Currency | null;
  /** A subscription with a trial exists (any status) → users.trial_used = 1. */
  trialStarted: boolean;
  /** Subscriptions that still bill: cancelled at once when Lifetime is bought. */
  liveSubscriptionIds: string[];
  /** Payment intents of refunded or disputed Lifetime purchases. */
  revokedPaymentIntentIds: string[];
};

export type PriceIds = { monthly: string; annual: string; lifetime: string };

export function priceIds(env: Pick<Env, "PRICE_MONTHLY" | "PRICE_ANNUAL" | "PRICE_LIFETIME">): PriceIds {
  return { monthly: env.PRICE_MONTHLY, annual: env.PRICE_ANNUAL, lifetime: env.PRICE_LIFETIME };
}

const ENDED = new Set(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]);
const NOT_BILLING = new Set(["canceled", "incomplete_expired"]);

function currencyOf(c: string | null | undefined): Currency | null {
  const v = c?.toLowerCase();
  return v === "eur" || v === "usd" || v === "pln" ? v : null;
}

function planOf(sub: SubInput, prices: PriceIds): Plan | null {
  if (sub.priceId && sub.priceId === prices.monthly) return "monthly";
  if (sub.priceId && sub.priceId === prices.annual) return "annual";
  if (sub.metaPlan === "monthly" || sub.metaPlan === "annual") return sub.metaPlan;
  return null;
}

type SubState = { status: DerivedEntitlement["status"]; until: number | null; trialEnd: number | null };

/** One subscription → its §5 row. */
export function subscriptionState(sub: SubInput): SubState {
  if (ENDED.has(sub.status)) return { status: "none", until: null, trialEnd: null };
  const canceling = sub.cancelAtPeriodEnd || sub.cancelAt !== null;
  if (sub.status === "trialing") {
    const end = sub.trialEnd ?? sub.periodEnd;
    const until = canceling && sub.cancelAt !== null && end !== null ? Math.min(end, sub.cancelAt) : end;
    return { status: canceling ? "canceling" : "trialing", until, trialEnd: sub.trialEnd };
  }
  if (sub.status === "active") {
    const end = sub.periodEnd;
    const until = canceling && sub.cancelAt !== null && end !== null ? Math.min(end, sub.cancelAt) : end;
    return { status: canceling ? "canceling" : "active", until, trialEnd: sub.trialEnd };
  }
  if (sub.status === "past_due") {
    return {
      status: "past_due",
      until: sub.periodEnd === null ? null : sub.periodEnd + PAST_DUE_GRACE_MS,
      trialEnd: sub.trialEnd,
    };
  }
  return { status: "none", until: null, trialEnd: null };
}

/** The §5 table over all of a customer's subscriptions and Lifetime purchases. */
export function deriveEntitlement(
  subs: SubInput[],
  lifetimes: LifetimeInput[],
  prices: PriceIds,
): DerivedEntitlement {
  const trialStarted = subs.some((s) => s.trialEnd !== null);
  const liveSubscriptionIds = subs.filter((s) => !NOT_BILLING.has(s.status)).map((s) => s.id);
  const revokedPaymentIntentIds = lifetimes
    .filter((l) => l.revoked && l.paymentIntentId)
    .map((l) => l.paymentIntentId as string);

  const paid = lifetimes.filter((l) => !l.revoked).sort((a, b) => a.created - b.created)[0];
  if (paid) {
    return {
      status: "lifetime",
      plan: "lifetime",
      until: null,
      trialEnd: null,
      subscriptionId: null,
      paymentIntentId: paid.paymentIntentId,
      currency: currencyOf(paid.currency),
      trialStarted,
      liveSubscriptionIds,
      revokedPaymentIntentIds,
    };
  }

  // The subscription that gives the most: any with access, latest end first;
  // otherwise the newest one (so `former` can tell a plan existed).
  const ranked = subs
    .map((s) => ({ s, st: subscriptionState(s) }))
    .sort((a, b) => {
      const aa = a.st.status !== "none" ? 1 : 0;
      const ba = b.st.status !== "none" ? 1 : 0;
      if (aa !== ba) return ba - aa;
      if (aa && (a.st.until ?? 0) !== (b.st.until ?? 0)) return (b.st.until ?? 0) - (a.st.until ?? 0);
      return b.s.created - a.s.created;
    });
  const best = ranked[0];
  if (!best) {
    return {
      status: "none",
      plan: null,
      until: null,
      trialEnd: null,
      subscriptionId: null,
      paymentIntentId: lifetimes[0]?.paymentIntentId ?? null,
      currency: null,
      trialStarted,
      liveSubscriptionIds,
      revokedPaymentIntentIds,
    };
  }
  const has = best.st.status !== "none";
  return {
    status: best.st.status,
    plan: has ? planOf(best.s, prices) : null,
    until: best.st.until,
    trialEnd: has ? best.st.trialEnd : null,
    subscriptionId: best.s.id,
    paymentIntentId: null,
    currency: currencyOf(best.s.currency),
    trialStarted,
    liveSubscriptionIds,
    revokedPaymentIntentIds,
  };
}

export type EntitlementRow = {
  user_id: string;
  plan: string | null;
  status: string;
  until: number | null;
  trial_end: number | null;
  stripe_subscription_id: string | null;
  stripe_payment_intent_id: string | null;
  currency: string | null;
  updated_at: number;
  read_at: number;
};

export async function readEntitlementRow(db: D1Database, userId: string): Promise<EntitlementRow | null> {
  return db.prepare("SELECT * FROM entitlements WHERE user_id = ?").bind(userId).first<EntitlementRow>();
}

/**
 * When a stored row (alias `e`) may be replaced by the derived one (?3 status,
 * ?10 read_at, ?11 revoked payment intents as JSON): `beta` never, `lifetime`
 * only by a Lifetime or a refund / dispute of that purchase, and never by a
 * Stripe state read earlier than the stored one (concurrent webhooks).
 */
const REPLACEABLE = (e: string) => `${e}.status <> 'beta'
  AND ?10 >= ${e}.read_at
  AND (${e}.status <> 'lifetime' OR ?3 = 'lifetime'
    OR CASE WHEN ${e}.stripe_payment_intent_id IS NULL THEN json_array_length(?11) > 0
       ELSE ${e}.stripe_payment_intent_id IN (SELECT value FROM json_each(?11)) END)`;

export type WriteOptions = {
  /** When the Stripe state in `d` was read (ms); a row read later is never overwritten. Default `now`. */
  readAt?: number;
  /** trial_history key of the user's email (`trialKey`), recorded when a trial started. */
  trialKey?: string;
};

/**
 * Writes a derived entitlement. The precedence (`REPLACEABLE`) is part of the
 * SQL, and the list is marked dirty in the same batch only when the write
 * applies and changes plan or status, so concurrent writers cannot race.
 * Returns whether plan or status changed (→ the caller syncs the contact).
 */
export async function writeEntitlement(
  db: D1Database,
  userId: string,
  d: DerivedEntitlement,
  now: number,
  opts: WriteOptions = {},
): Promise<{ changed: boolean; written: boolean }> {
  const params = [
    userId,
    d.plan,
    d.status,
    d.until,
    d.trialEnd,
    d.subscriptionId,
    d.paymentIntentId,
    d.currency,
    now,
    opts.readAt ?? now,
    JSON.stringify(d.revokedPaymentIntentIds),
  ];
  const stmts: D1PreparedStatement[] = [
    // evaluated before the upsert, in the same transaction
    db
      .prepare(
        `UPDATE users SET list_dirty = 1, list_attempts = 0 WHERE id = ?1 AND (
           NOT EXISTS (SELECT 1 FROM entitlements WHERE user_id = ?1)
           OR EXISTS (SELECT 1 FROM entitlements e WHERE e.user_id = ?1 AND ${REPLACEABLE("e")}
                        AND (e.plan IS NOT ?2 OR e.status <> ?3)))`,
      )
      .bind(...params),
    db
      .prepare(
        `INSERT INTO entitlements (user_id, plan, status, until, trial_end, stripe_subscription_id,
           stripe_payment_intent_id, currency, updated_at, read_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = excluded.status,
           until = excluded.until, trial_end = excluded.trial_end,
           stripe_subscription_id = COALESCE(excluded.stripe_subscription_id, entitlements.stripe_subscription_id),
           stripe_payment_intent_id = COALESCE(excluded.stripe_payment_intent_id, entitlements.stripe_payment_intent_id),
           currency = COALESCE(excluded.currency, entitlements.currency),
           updated_at = excluded.updated_at, read_at = excluded.read_at
         WHERE ${REPLACEABLE("entitlements")}
         RETURNING user_id`,
      )
      .bind(...params),
  ];
  if (d.trialStarted) {
    stmts.push(db.prepare("UPDATE users SET trial_used = 1 WHERE id = ? AND trial_used = 0").bind(userId));
    if (opts.trialKey) {
      stmts.push(db.prepare("INSERT OR IGNORE INTO trial_history (email_hash) VALUES (?)").bind(opts.trialKey));
    }
  }
  const [dirty, upsert] = await db.batch(stmts);
  return {
    changed: (dirty.meta?.changes ?? 0) > 0,
    written: (upsert.results ?? []).length > 0,
  };
}

const NO_UNTIL = new Set<EntitlementStatus>(["lifetime", "beta"]);

export function toEntitlement(row: EntitlementRow | null, trialUsed: boolean, now: number): Entitlement {
  if (!row) {
    return { status: "none", plan: null, access: false, until: null, trialEnd: null, trialUsed, checkedAt: now };
  }
  const status = row.status as EntitlementStatus;
  const until = NO_UNTIL.has(status) || status === "none" ? null : row.until;
  const access = status !== "none" && (NO_UNTIL.has(status) || (until !== null && now < until));
  return {
    status,
    plan: status === "none" ? null : ((row.plan as EntitlementPlan | null) ?? null),
    access,
    until,
    trialEnd: status === "none" ? null : row.trial_end,
    trialUsed,
    checkedAt: now,
  };
}

/** The entitlement the API returns: entitlements row + users.trial_used. Missing row → none. */
export async function readEntitlement(db: D1Database, userId: string, now: number): Promise<Entitlement> {
  const r = await db
    .prepare(
      `SELECT u.trial_used AS trial_used, e.user_id AS user_id, e.plan AS plan, e.status AS status,
         e.until AS until, e.trial_end AS trial_end, e.stripe_subscription_id AS stripe_subscription_id,
         e.stripe_payment_intent_id AS stripe_payment_intent_id, e.currency AS currency,
         e.updated_at AS updated_at
       FROM users u LEFT JOIN entitlements e ON e.user_id = u.id WHERE u.id = ?`,
    )
    .bind(userId)
    .first<EntitlementRow & { trial_used: number }>();
  const trialUsed = !!r?.trial_used;
  return toEntitlement(r && r.status ? r : null, trialUsed, now);
}
