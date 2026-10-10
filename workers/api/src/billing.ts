/**
 * /billing/* routes, the Stripe webhook, the Stripe part of account deletion
 * and the billing cron (plans/phase-4.md §9, §11, §12). Stripe is reached only
 * through ./stripe; the entitlement is written only through ./entitlement.
 */
import { lifetimeOfferUntil } from "./config";
import { trialKey } from "./auth";
import {
  CURRENCIES,
  PLANS,
  type CheckoutRequest,
  type Currency,
  type Entitlement,
  type Plan,
} from "./contract";
import { bumpCounter, getUserById, toUser, utcDay, type UserRow } from "./db";
import { EMAIL_BUDGETS, sendEmail, type EmailMessage } from "./email";
import { readEntitlement, writeEntitlement } from "./entitlement";
import type { BillingRoutes, Env } from "./env";
import { apiError, isRecord, json, readJson, readText } from "./http";
import { dirtyUsers, syncContact, unsubscribe } from "./list";
import * as stripe from "./stripe";

export const REMINDER_WINDOW_MS = 36 * 3_600_000;
/**
 * Subrequests (D1 queries and fetches both count; the free plan allows 50 per
 * invocation) of one hourly run, worst case:
 * 1 (due reminders) + 3 per reminder (counter, Resend, mark)
 * + 1 (dirty users) + 6 per list user (2 reads, ≤ 3 Resend calls, 1 write) = 41 ≤ 45.
 */
export const CRON_MAX_REMINDERS = 5;
export const CRON_MAX_LIST_USERS = 4;
export const CRON_MAX_SUBREQUESTS = 45;
/** Webhook bodies above this are refused unread (Stripe events are a few kB). */
export const WEBHOOK_MAX_BYTES = 256 * 1024;
/** An unprocessed stripe_events row older than this is a dead attempt: the event is processed again. */
export const WEBHOOK_STALE_MS = 5 * 60_000;
/** Resend allows about 2 calls a second. */
export const CRON_LIST_PACE_MS = 550;

export function lifetimeOfferOpen(env: Pick<Env, "LIFETIME_OFFER_UNTIL">, now: number): boolean {
  const until = lifetimeOfferUntil(env);
  return until !== null && now < until;
}

/**
 * Re-reads the customer at Stripe and writes the entitlement (webhook and
 * /billing/refresh share it). A Lifetime buyer's live subscriptions are then
 * cancelled, best effort: a failure is logged and the next sync tries again.
 * Throws on a Stripe read failure.
 */
export async function syncFromStripe(
  env: Env,
  ctx: ExecutionContext,
  user: Pick<UserRow, "id" | "email">,
  customerId: string,
  now: number,
): Promise<Entitlement> {
  const readAt = Date.now();
  const derived = await stripe.entitlementFor(env, customerId);
  const { changed } = await writeEntitlement(env.DB, user.id, derived, now, {
    readAt,
    trialKey: derived.trialStarted ? await trialKey(env, user.email) : undefined,
  });
  if (changed) ctx.waitUntil(syncContact(env, user.id));
  if (derived.status === "lifetime") {
    for (const id of derived.liveSubscriptionIds) {
      try {
        await stripe.cancelNow(env, id);
      } catch (e) {
        console.error(`billing: could not cancel ${id} after Lifetime; the next sync retries`, errText(e));
      }
    }
  }
  return readEntitlement(env.DB, user.id, now);
}

const isPlan = (x: unknown): x is Plan => typeof x === "string" && (PLANS as readonly string[]).includes(x);
const isCurrency = (x: unknown): x is Currency =>
  typeof x === "string" && (CURRENCIES as readonly string[]).includes(x);

async function checkout(req: Request, env: Env, _ctx: ExecutionContext, who: { userId: string }): Promise<Response> {
  const body = await readJson<CheckoutRequest>(req);
  if (!isRecord(body) || !isPlan(body.plan) || !isCurrency(body.currency)) return apiError(400, "bad_request");
  const { plan, currency } = body;
  const now = Date.now();
  if (plan === "lifetime" && !lifetimeOfferOpen(env, now)) return apiError(410, "offer_ended");

  const user = await getUserById(env.DB, who.userId);
  if (!user) return apiError(401, "unauthorized");
  const ent = await readEntitlement(env.DB, user.id, now);
  if (ent.status === "beta" || ent.status === "lifetime") return apiError(409, "has_lifetime_or_beta");
  if (ent.access && plan !== "lifetime") return apiError(409, "already_subscribed");

  try {
    // D1 may lag behind Stripe (a webhook in flight): never open a second subscription
    if (plan !== "lifetime" && user.stripe_customer_id) {
      const live = await stripe.liveSubscriptionIds(env, user.stripe_customer_id);
      if (live.length) return apiError(409, "already_subscribed");
    }
    const hadTrial =
      !!user.trial_used ||
      !!(await env.DB.prepare("SELECT 1 AS x FROM trial_history WHERE email_hash = ?")
        .bind(await trialKey(env, user.email))
        .first());
    const r = await stripe.createCheckout(env, {
      user: toUser(user),
      customerId: user.stripe_customer_id,
      plan,
      currency,
      trial: !hadTrial,
    });
    if (r.customerId !== user.stripe_customer_id) {
      await env.DB.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL")
        .bind(r.customerId, user.id)
        .run();
    }
    return json({ url: r.url });
  } catch (e) {
    console.error("billing: checkout failed", errText(e));
    return apiError(502, "stripe_error");
  }
}

async function refresh(_req: Request, env: Env, ctx: ExecutionContext, who: { userId: string }): Promise<Response> {
  const now = Date.now();
  const user = await getUserById(env.DB, who.userId);
  if (!user) return apiError(401, "unauthorized");
  if (!user.stripe_customer_id) return json({ entitlement: await readEntitlement(env.DB, user.id, now) });
  try {
    return json({ entitlement: await syncFromStripe(env, ctx, user, user.stripe_customer_id, now) });
  } catch (e) {
    console.error("billing: refresh failed", errText(e));
    return apiError(502, "stripe_error");
  }
}

async function portal(_req: Request, env: Env, _ctx: ExecutionContext, who: { userId: string }): Promise<Response> {
  const user = await getUserById(env.DB, who.userId);
  if (!user) return apiError(401, "unauthorized");
  if (!user.stripe_customer_id) return apiError(409, "no_customer");
  try {
    return json(await stripe.createPortalUrl(env, user.stripe_customer_id));
  } catch (e) {
    console.error("billing: portal failed", errText(e));
    return apiError(502, "stripe_error");
  }
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The user and customer an event is about: by customer id first, then metadata.user_id. */
async function userForEvent(
  db: D1Database,
  obj: Record<string, unknown>,
): Promise<{ user: UserRow; customerId: string | null } | null> {
  const cust = obj.customer;
  const customerId = typeof cust === "string" ? cust : isRecord(cust) && typeof cust.id === "string" ? cust.id : null;
  if (customerId) {
    const u = await db.prepare("SELECT * FROM users WHERE stripe_customer_id = ?").bind(customerId).first<UserRow>();
    if (u) return { user: u, customerId };
  }
  const meta = isRecord(obj.metadata) ? obj.metadata : {};
  const parent = isRecord(obj.parent) && isRecord(obj.parent.subscription_details)
    ? obj.parent.subscription_details
    : null;
  const parentMeta = parent && isRecord(parent.metadata) ? parent.metadata : {};
  const userId = [meta.user_id, obj.client_reference_id, parentMeta.user_id].find(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  if (!userId) {
    // A dispute carries no customer or metadata: find the Lifetime purchase by its payment intent.
    const pi = obj.payment_intent;
    if (typeof pi !== "string") return null;
    const byPi = await db
      .prepare("SELECT u.* FROM users u JOIN entitlements e ON e.user_id = u.id WHERE e.stripe_payment_intent_id = ?")
      .bind(pi)
      .first<UserRow>();
    return byPi ? { user: byPi, customerId: byPi.stripe_customer_id } : null;
  }
  const u = await getUserById(db, userId);
  if (!u) return null;
  return { user: u, customerId: u.stripe_customer_id ?? customerId };
}

export const WEBHOOK_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
]);

/**
 * POST /billing/webhook. De-duplication: the event id is claimed before
 * processing (processed_at NULL) and marked processed after. A claim younger
 * than WEBHOOK_STALE_MS is in flight: the duplicate gets 409 so Stripe retries
 * it later; an older unprocessed claim is a dead attempt and is taken over.
 */
async function webhook(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const sig = req.headers.get("Stripe-Signature");
  if (!sig) return apiError(400, "bad_signature");
  const body = await readText(req, WEBHOOK_MAX_BYTES);
  if (!body.ok) return body.reason === "too_large" ? apiError(413, "too_large") : apiError(400, "bad_request");
  let event: Awaited<ReturnType<typeof stripe.verifyWebhook>>;
  try {
    event = await stripe.verifyWebhook(env, body.value, sig);
  } catch {
    return apiError(400, "bad_signature");
  }
  if (!WEBHOOK_EVENTS.has(event.type)) return json({ received: true });

  const now = Date.now();
  const db = env.DB;
  const claimed = await db
    .prepare(
      `INSERT INTO stripe_events (id, type, received_at, processed_at) VALUES (?1, ?2, ?3, NULL)
       ON CONFLICT (id) DO UPDATE SET received_at = excluded.received_at
       WHERE stripe_events.processed_at IS NULL AND stripe_events.received_at <= ?3 - ?4
       RETURNING id`,
    )
    .bind(event.id, event.type, now, WEBHOOK_STALE_MS)
    .first();
  if (!claimed) {
    const row = await db.prepare("SELECT processed_at FROM stripe_events WHERE id = ?").bind(event.id).first<{ processed_at: number | null }>();
    if (row && row.processed_at === null) return json({ received: false, inFlight: true }, 409);
    return json({ received: true });
  }
  const done = () => db.prepare("UPDATE stripe_events SET processed_at = ? WHERE id = ?").bind(Date.now(), event.id).run();

  try {
    const obj = event.data.object as unknown as Record<string, unknown>;
    const found = await userForEvent(db, obj);
    if (!found || !found.customerId) {
      console.log(`billing: ${event.type} ${event.id} for no known user; ignored`);
      await done();
      return json({ received: true });
    }
    const { user, customerId } = found;
    if (!user.stripe_customer_id) {
      await db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL")
        .bind(customerId, user.id)
        .run();
    }
    await syncFromStripe(env, ctx, user, customerId, now);
    await done();
    return json({ received: true });
  } catch (e) {
    // Forget the event so Stripe's retry is processed.
    console.error(`billing: webhook ${event.type} ${event.id} failed`, errText(e));
    await db.prepare("DELETE FROM stripe_events WHERE id = ?").bind(event.id).run();
    return apiError(500, "internal");
  }
}

export const billingRoutes: BillingRoutes = { checkout, refresh, portal, webhook, unsubscribe };

/**
 * Account deletion, Stripe part (§12 steps 1–2): cancel every live
 * subscription now (no refund), then delete the customer. Throws on any
 * Stripe failure, so the caller deletes nothing and answers 502.
 */
export async function deleteBillingFor(env: Env, userId: string): Promise<void> {
  const user = await getUserById(env.DB, userId);
  const customerId = user?.stripe_customer_id;
  if (!customerId) return;
  for (const id of await stripe.liveSubscriptionIds(env, customerId)) await stripe.cancelNow(env, id);
  await stripe.deleteCustomer(env, customerId);
}

// ---- Trial reminder (§11) ----

/** Display prices (keep equal to lib/plans.ts and the Stripe prices). */
const PRICE_TEXT: Record<"monthly" | "annual", Record<Currency, string>> = {
  monthly: { eur: "€6.99 a month", usd: "$7.99 a month", pln: "29.99 zł a month" },
  annual: { eur: "€49 a year", usd: "$54.99 a year", pln: "199 zł a year" },
};

export function trialReminderEmail(
  env: Pick<Env, "APP_URL">,
  to: string,
  trialEnd: number,
  plan: string | null,
  currency: string | null,
): EmailMessage {
  const date = new Date(trialEnd).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const p = plan === "monthly" || plan === "annual" ? plan : "annual";
  const c: Currency = currency === "usd" || currency === "pln" ? currency : "eur";
  const price = PRICE_TEXT[p][c];
  const name = p === "monthly" ? "PolishUp Pro Monthly" : "PolishUp Pro Annual";
  const link = `${env.APP_URL}/billing`;
  return {
    to,
    subject: `Your PolishUp trial ends on ${date}`,
    text: [
      `Your free PolishUp trial ends on ${date}.`,
      "",
      `Then ${name} costs ${price}.`,
      "",
      `To manage or cancel your plan, go to ${link}`,
      "Cancel before the trial ends and you pay nothing.",
    ].join("\n"),
    html: `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a">
<p>Your free PolishUp trial ends on <strong>${date}</strong>.</p>
<p>Then ${name} costs ${price}.</p>
<p>To manage or cancel your plan, go to <a href="${link}">${link}</a>.<br>
Cancel before the trial ends and you pay nothing.</p>
</body></html>`,
  };
}

async function sendTrialReminders(env: Env, now: number): Promise<void> {
  const due = await env.DB.prepare(
    `SELECT u.id, u.email, e.trial_end, e.plan, e.currency
     FROM entitlements e JOIN users u ON u.id = e.user_id
     WHERE e.status = 'trialing' AND e.trial_end IS NOT NULL AND e.trial_end > ?1
       AND e.trial_end - ?1 <= ?2 AND u.reminder_sent_at IS NULL
     ORDER BY e.trial_end LIMIT ?3`,
  )
    .bind(now, REMINDER_WINDOW_MS, CRON_MAX_REMINDERS)
    .all<{ id: string; email: string; trial_end: number; plan: string | null; currency: string | null }>();
  const { key, cap } = EMAIL_BUDGETS.reminder;
  for (const r of due.results) {
    if (!(await bumpCounter(env.DB, key, utcDay(now), cap))) {
      console.error("billing: daily reminder budget reached; reminders wait for tomorrow");
      return;
    }
    const sent = await sendEmail(env, trialReminderEmail(env, r.email, r.trial_end, r.plan, r.currency));
    // 429, 5xx and network failures (status 0) are retried next hour; any other
    // 4xx will never succeed, so it is marked done and stops blocking the queue
    const permanent = !sent.ok && sent.status >= 400 && sent.status < 500 && sent.status !== 429;
    if (permanent) console.error(`billing: trial reminder for user ${r.id} refused (${sent.status}); not retried`);
    if (sent.ok || permanent) {
      await env.DB.prepare("UPDATE users SET reminder_sent_at = ? WHERE id = ?").bind(now, r.id).run();
    }
  }
}

/**
 * Hourly (§11, §10.2): trial reminders, then the contact-list retries. At most
 * CRON_MAX_REMINDERS emails and CRON_MAX_LIST_USERS users, within
 * CRON_MAX_SUBREQUESTS. Never throws.
 */
export async function runBillingCron(
  env: Env,
  now: number,
  opts: { paceMs?: number } = {},
): Promise<void> {
  try {
    await sendTrialReminders(env, now);
  } catch (e) {
    console.error("billing: trial reminders failed", errText(e));
  }
  try {
    const pace = opts.paceMs ?? CRON_LIST_PACE_MS;
    const ids = await dirtyUsers(env.DB, CRON_MAX_LIST_USERS);
    for (const [i, id] of ids.entries()) {
      if (i > 0 && pace) await new Promise((r) => setTimeout(r, pace));
      await syncContact(env, id, { paceMs: pace });
    }
  } catch (e) {
    console.error("billing: list retries failed", errText(e));
  }
}
