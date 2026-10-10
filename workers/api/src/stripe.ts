/**
 * The thin Stripe module (plans/phase-4.md §9.1). Routes and D1 code never touch
 * the SDK: they call these functions. Every function takes `env` first (the
 * spec's signatures plus env, since the Worker has no module-level secrets).
 *
 * API version: the one pinned by the installed `stripe` package (≥
 * 2025-03-31.basil, which Managed Payments needs; there `current_period_end`
 * is on the subscription items).
 */
import Stripe from "stripe";
import type { Currency, Plan, User } from "./contract";
import {
  deriveEntitlement,
  priceIds,
  type DerivedEntitlement,
  type LifetimeInput,
  type SubInput,
} from "./entitlement";
import type { Env } from "./env";

let cached: { key: string; client: Stripe } | null = null;

/** One client per secret key (per isolate). Exported for tests. */
export function stripeClient(env: Pick<Env, "STRIPE_SECRET_KEY">): Stripe {
  if (cached?.key !== env.STRIPE_SECRET_KEY) {
    cached = {
      key: env.STRIPE_SECRET_KEY,
      client: new Stripe(env.STRIPE_SECRET_KEY, {
        httpClient: Stripe.createFetchHttpClient(),
        maxNetworkRetries: 1,
        timeout: 15_000,
      }),
    };
  }
  return cached.client;
}

const ms = (s: number | null | undefined): number | null => (typeof s === "number" ? s * 1000 : null);
const idOf = (x: string | { id: string } | null | undefined): string | null =>
  typeof x === "string" ? x : (x?.id ?? null);

export function priceFor(env: Env, plan: Plan): string {
  return plan === "monthly" ? env.PRICE_MONTHLY : plan === "annual" ? env.PRICE_ANNUAL : env.PRICE_LIFETIME;
}

export async function createCustomer(env: Env, user: User): Promise<string> {
  const c = await stripeClient(env).customers.create(
    { email: user.email, metadata: { user_id: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  return c.id;
}

/** Checkout Session per the §9.2 table. Creates the customer when there is none. */
export async function createCheckout(
  env: Env,
  o: { user: User; customerId: string | null; plan: Plan; currency: Currency; trial: boolean },
): Promise<{ url: string; customerId: string }> {
  const customerId = o.customerId ?? (await createCustomer(env, o.user));
  const metadata = { user_id: o.user.id, plan: o.plan };
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: o.plan === "lifetime" ? "payment" : "subscription",
    line_items: [{ price: priceFor(env, o.plan), quantity: 1 }],
    currency: o.currency,
    customer: customerId,
    client_reference_id: o.user.id,
    metadata,
    managed_payments: { enabled: true },
    success_url: `${env.APP_URL}/billing?checkout=done`,
    cancel_url: `${env.APP_URL}/plans`,
  };
  if (o.plan === "lifetime") {
    params.payment_intent_data = { metadata: { user_id: o.user.id } };
  } else {
    params.subscription_data = {
      metadata,
      ...(o.trial ? { trial_period_days: 3 } : {}),
    };
  }
  const session = await stripeClient(env).checkout.sessions.create(params);
  if (!session.url) throw new Error("checkout session without url");
  return { url: session.url, customerId };
}

export async function createPortalUrl(env: Env, customerId: string): Promise<{ url: string }> {
  const s = await stripeClient(env).billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.APP_URL}/billing`,
  });
  return { url: s.url };
}

/** Throws (Stripe.errors.StripeSignatureVerificationError) on a bad signature. */
export async function verifyWebhook(env: Env, rawBody: string, signature: string): Promise<Stripe.Event> {
  return stripeClient(env).webhooks.constructEventAsync(
    rawBody,
    signature,
    env.STRIPE_WEBHOOK_SECRET,
    undefined,
    Stripe.createSubtleCryptoProvider(),
  );
}

export function toSubInput(s: Stripe.Subscription): SubInput {
  const item = s.items?.data?.[0];
  return {
    id: s.id,
    status: s.status,
    cancelAtPeriodEnd: !!s.cancel_at_period_end,
    cancelAt: ms(s.cancel_at),
    trialEnd: ms(s.trial_end),
    periodEnd: ms(item?.current_period_end),
    priceId: item?.price?.id ?? null,
    metaPlan: s.metadata?.plan ?? null,
    currency: s.currency ?? null,
    created: ms(s.created) ?? 0,
  };
}

/** A completed Lifetime Checkout Session → its purchase, or null if not a paid Lifetime. */
export function toLifetimeInput(
  s: Stripe.Checkout.Session,
  lifetimePrice: string,
  /** Payment intents whose every dispute was won (looked up by entitlementFor). */
  disputesWon: ReadonlySet<string> = new Set(),
): LifetimeInput | null {
  if (s.mode !== "payment" || s.payment_status !== "paid") return null;
  const isLifetime =
    s.metadata?.plan === "lifetime" ||
    (s.line_items?.data ?? []).some((li) => li.price?.id === lifetimePrice);
  if (!isLifetime) return null;
  const pi = s.payment_intent;
  let revoked = false;
  if (pi && typeof pi !== "string") {
    if (pi.status === "canceled") revoked = true;
    const charge = pi.latest_charge;
    if (charge && typeof charge !== "string") {
      // `refunded` = fully refunded. A dispute ends Lifetime unless it was won.
      if (charge.refunded) revoked = true;
      if (charge.disputed && !disputesWon.has(pi.id)) revoked = true;
    }
  }
  return { paymentIntentId: idOf(pi), currency: s.currency ?? null, created: ms(s.created) ?? 0, revoked };
}

const WON: ReadonlySet<string> = new Set(["won", "warning_closed"]);

/** Disputed payment intents of Lifetime sessions whose disputes were all won (1 call each; rare). */
async function wonDisputes(stripe: Stripe, sessions: Stripe.Checkout.Session[]): Promise<Set<string>> {
  const won = new Set<string>();
  for (const s of sessions) {
    const pi = s.payment_intent;
    if (s.mode !== "payment" || !pi || typeof pi === "string") continue;
    const charge = pi.latest_charge;
    if (!charge || typeof charge === "string" || !charge.disputed) continue;
    const disputes = await stripe.disputes.list({ payment_intent: pi.id, limit: 10 });
    if (disputes.data.length > 0 && disputes.data.every((d) => WON.has(d.status))) won.add(pi.id);
  }
  return won;
}

/**
 * The customer's derived entitlement: lists its subscriptions and its paid
 * Lifetime Checkout Sessions (2 Stripe calls, plus one per disputed Lifetime
 * payment) and applies §5. Webhooks and
 * /billing/refresh both use it, so the payload of an event is never trusted.
 */
export async function entitlementFor(env: Env, customerId: string): Promise<DerivedEntitlement> {
  const stripe = stripeClient(env);
  const [subs, sessions] = await Promise.all([
    stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 }),
    stripe.checkout.sessions.list({
      customer: customerId,
      status: "complete",
      limit: 100,
      expand: ["data.payment_intent.latest_charge"],
    }),
  ]);
  const won = await wonDisputes(stripe, sessions.data);
  const lifetimes = sessions.data
    .map((s) => toLifetimeInput(s, env.PRICE_LIFETIME, won))
    .filter((l): l is LifetimeInput => l !== null);
  return deriveEntitlement(subs.data.map(toSubInput), lifetimes, priceIds(env));
}

/** Subscriptions of the customer that still bill (for account deletion). */
export async function liveSubscriptionIds(env: Env, customerId: string): Promise<string[]> {
  const subs = await stripeClient(env).subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  return subs.data.filter((s) => s.status !== "canceled" && s.status !== "incomplete_expired").map((s) => s.id);
}

const isMissing = (e: unknown): boolean =>
  e instanceof Stripe.errors.StripeError && (e.code === "resource_missing" || e.statusCode === 404);

/** Cancels at once, no proration refund. An already-gone subscription is fine. */
export async function cancelNow(env: Env, subscriptionId: string): Promise<void> {
  try {
    await stripeClient(env).subscriptions.cancel(subscriptionId);
  } catch (e) {
    if (!isMissing(e)) throw e;
  }
}

/** Deletes the customer (payments and invoices stay at Stripe). Already gone is fine. */
export async function deleteCustomer(env: Env, customerId: string): Promise<void> {
  try {
    await stripeClient(env).customers.del(customerId);
  } catch (e) {
    if (!isMissing(e)) throw e;
  }
}

export { Stripe };
