import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as stripeMod from "../src/stripe";
import { WEBHOOK_MAX_BYTES, WEBHOOK_STALE_MS, billingRoutes } from "../src/billing";
import type { DerivedEntitlement } from "../src/entitlement";
import { addUser, entRow, makeCtx, makeEnv, setEntitlement, userRow } from "./billing-helpers";

// Real signature check; the Stripe reads (entitlementFor, cancelNow) are mocked.
vi.mock("../src/stripe", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/stripe")>();
  return { ...m, entitlementFor: vi.fn(), cancelNow: vi.fn() };
});
const entitlementFor = vi.mocked(stripeMod.entitlementFor);
const cancelNow = vi.mocked(stripeMod.cancelNow);

const SECRET = "whsec_test";
const signer = new Stripe("sk_test_sign");
const DAY = 86_400_000;

function event(id: string, type: string, object: Record<string, unknown>) {
  return JSON.stringify({ id, object: "event", type, data: { object }, created: 1, livemode: false, api_version: Stripe.API_VERSION });
}
function hook(payload: string, sig?: string) {
  return new Request("https://api.polishup.app/billing/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sig === "" ? {} : { "Stripe-Signature": sig ?? signer.webhooks.generateTestHeaderString({ payload, secret: SECRET }) }),
    },
    body: payload,
  });
}
const d = (o: Partial<DerivedEntitlement>): DerivedEntitlement => ({
  status: "active",
  plan: "monthly",
  until: Date.now() + 30 * DAY,
  trialEnd: null,
  subscriptionId: "sub_1",
  paymentIntentId: null,
  currency: "eur",
  trialStarted: false,
  liveSubscriptionIds: ["sub_1"],
  revokedPaymentIntentIds: [],
  ...o,
});

beforeEach(() => {
  entitlementFor.mockReset();
  cancelNow.mockReset();
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 200 })); // Resend
});

describe("POST /billing/webhook", () => {
  it("bad or missing signature → 400 bad_signature", async () => {
    const env = await makeEnv();
    const payload = event("evt_1", "invoice.paid", { customer: "cus_1" });
    const bad = await billingRoutes.webhook(hook(payload, "t=1,v1=deadbeef"), env, makeCtx());
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "bad_signature" });
    expect((await billingRoutes.webhook(hook(payload, ""), env, makeCtx())).status).toBe(400);
    const wrongSecret = signer.webhooks.generateTestHeaderString({ payload, secret: "whsec_other" });
    expect((await billingRoutes.webhook(hook(payload, wrongSecret), env, makeCtx())).status).toBe(400);
    expect(entitlementFor).not.toHaveBeenCalled();
  });

  it("checks the signature header before reading the body, and caps the body", async () => {
    const env = await makeEnv();
    const unsigned = hook(event("evt_1", "invoice.paid", { customer: "cus_1" }), "");
    expect((await billingRoutes.webhook(unsigned, env, makeCtx())).status).toBe(400);
    expect(unsigned.bodyUsed).toBe(false);
    const huge = event("evt_big", "invoice.paid", { customer: "cus_1", pad: "x".repeat(WEBHOOK_MAX_BYTES) });
    const res = await billingRoutes.webhook(hook(huge), env, makeCtx());
    expect(res.status).toBe(413);
    expect(entitlementFor).not.toHaveBeenCalled();
  });

  it.each([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
    "charge.refunded",
    "charge.dispute.created",
    "charge.dispute.closed",
  ])("%s → re-fetches and writes the entitlement", async (type) => {
    const env = await makeEnv();
    const id = await addUser(env, { stripe_customer_id: "cus_1" });
    entitlementFor.mockResolvedValue(d({ status: "trialing", trialEnd: Date.now() + DAY, trialStarted: true }));
    const ctx = makeCtx();
    const res = await billingRoutes.webhook(hook(event(`evt_${type}`, type, { id: "obj_1", customer: "cus_1" })), env, ctx);
    await ctx.settle();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(entitlementFor).toHaveBeenCalledWith(env, "cus_1");
    expect((await entRow(env, id))?.status).toBe("trialing");
    expect(await userRow(env, id)).toMatchObject({ trial_used: 1, list_synced: "trialing|0", list_dirty: 0 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM trial_history").first("n")).toBe(1);
  });

  it("duplicate event → 200 at once, processed once", async () => {
    const env = await makeEnv();
    await addUser(env, { stripe_customer_id: "cus_1" });
    entitlementFor.mockResolvedValue(d({}));
    const payload = event("evt_dup", "invoice.paid", { customer: "cus_1" });
    expect((await billingRoutes.webhook(hook(payload), env, makeCtx())).status).toBe(200);
    expect((await billingRoutes.webhook(hook(payload), env, makeCtx())).status).toBe(200);
    expect(entitlementFor).toHaveBeenCalledTimes(1);
  });

  it("marks an event processed only after it succeeded", async () => {
    const env = await makeEnv();
    await addUser(env, { stripe_customer_id: "cus_1" });
    entitlementFor.mockResolvedValue(d({}));
    await billingRoutes.webhook(hook(event("evt_p", "invoice.paid", { customer: "cus_1" })), env, makeCtx());
    const row = await env.DB.prepare("SELECT processed_at FROM stripe_events WHERE id = 'evt_p'").first<{ processed_at: number | null }>();
    expect(row?.processed_at).not.toBeNull();
  });

  it("a duplicate of an event in flight gets 409 (Stripe retries); a dead attempt is processed again", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { stripe_customer_id: "cus_1" });
    entitlementFor.mockResolvedValue(d({}));
    const payload = event("evt_if", "invoice.paid", { customer: "cus_1" });
    // a claim left by an attempt that is still running
    await env.DB.prepare("INSERT INTO stripe_events (id, type, received_at) VALUES ('evt_if', 'invoice.paid', ?)").bind(Date.now() - 1000).run();
    const busy = await billingRoutes.webhook(hook(payload), env, makeCtx());
    expect(busy.status).toBe(409);
    expect(entitlementFor).not.toHaveBeenCalled();
    // the attempt died (isolate killed) more than 5 minutes ago
    await env.DB.prepare("UPDATE stripe_events SET received_at = ? WHERE id = 'evt_if'").bind(Date.now() - WEBHOOK_STALE_MS - 1).run();
    const again = await billingRoutes.webhook(hook(payload), env, makeCtx());
    expect(again.status).toBe(200);
    expect(entitlementFor).toHaveBeenCalledTimes(1);
    expect((await entRow(env, id))?.status).toBe("active");
  });

  it("other event types never touch D1", async () => {
    const env = await makeEnv();
    await billingRoutes.webhook(hook(event("evt_o", "customer.created", { customer: "cus_1" })), env, makeCtx());
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM stripe_events").first("n")).toBe(0);
  });

  it("out of order: the state comes from Stripe, not the payload", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { stripe_customer_id: "cus_1" });
    // Stripe now says: canceled. The older "created" event arrives last.
    entitlementFor.mockResolvedValue(d({ status: "none", plan: null, until: null, liveSubscriptionIds: [] }));
    await billingRoutes.webhook(hook(event("evt_b", "customer.subscription.deleted", { customer: "cus_1", status: "canceled" })), env, makeCtx());
    await billingRoutes.webhook(hook(event("evt_a", "customer.subscription.created", { customer: "cus_1", status: "active" })), env, makeCtx());
    expect((await entRow(env, id))?.status).toBe("none");
  });

  it("finds the user by metadata.user_id and stores the customer id", async () => {
    const env = await makeEnv();
    const id = await addUser(env);
    entitlementFor.mockResolvedValue(d({}));
    await billingRoutes.webhook(
      hook(event("evt_m", "checkout.session.completed", { customer: "cus_9", metadata: { user_id: id }, client_reference_id: id })),
      env,
      makeCtx(),
    );
    expect((await userRow(env, id))?.stripe_customer_id).toBe("cus_9");
    expect(entitlementFor).toHaveBeenCalledWith(env, "cus_9");
  });

  it("unknown user → 200 and a log line", async () => {
    const env = await makeEnv();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await billingRoutes.webhook(hook(event("evt_u", "invoice.paid", { customer: "cus_gone" })), env, makeCtx());
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalled();
    expect(entitlementFor).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("other event types are acknowledged and ignored", async () => {
    const env = await makeEnv();
    await addUser(env, { stripe_customer_id: "cus_1" });
    const res = await billingRoutes.webhook(hook(event("evt_t", "customer.subscription.trial_will_end", { customer: "cus_1" })), env, makeCtx());
    expect(res.status).toBe(200);
    expect(entitlementFor).not.toHaveBeenCalled();
  });

  it("Lifetime bought by a subscriber: subscription cancelled at once", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { stripe_customer_id: "cus_1" });
    await setEntitlement(env, id, { status: "active", plan: "monthly", sub: "sub_1" });
    entitlementFor.mockResolvedValue(d({ status: "lifetime", plan: "lifetime", until: null, paymentIntentId: "pi_1", subscriptionId: null }));
    await billingRoutes.webhook(hook(event("evt_l", "checkout.session.completed", { customer: "cus_1" })), env, makeCtx());
    expect(cancelNow).toHaveBeenCalledWith(env, "sub_1");
    expect(await entRow(env, id)).toMatchObject({ status: "lifetime", plan: "lifetime", stripe_payment_intent_id: "pi_1" });
  });

  it("Lifetime is written even when cancelling the old subscription fails (retried by the next sync)", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { stripe_customer_id: "cus_1" });
    await setEntitlement(env, id, { status: "active", plan: "monthly", sub: "sub_1" });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    cancelNow.mockRejectedValue(new Error("stripe down"));
    entitlementFor.mockResolvedValue(d({ status: "lifetime", plan: "lifetime", until: null, paymentIntentId: "pi_1", subscriptionId: null }));
    const res = await billingRoutes.webhook(hook(event("evt_lc", "checkout.session.completed", { customer: "cus_1" })), env, makeCtx());
    expect(res.status).toBe(200);
    expect((await entRow(env, id))?.status).toBe("lifetime");
    expect(err).toHaveBeenCalled();
    cancelNow.mockReset();
    await billingRoutes.webhook(hook(event("evt_lc2", "customer.subscription.updated", { customer: "cus_1" })), env, makeCtx());
    expect(cancelNow).toHaveBeenCalledWith(env, "sub_1");
    err.mockRestore();
  });

  it("refunded Lifetime → back to the subscription state", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { stripe_customer_id: "cus_1" });
    await setEntitlement(env, id, { status: "lifetime", plan: "lifetime", pi: "pi_1" });
    entitlementFor.mockResolvedValue(d({ status: "none", plan: null, until: null, subscriptionId: null, liveSubscriptionIds: [], revokedPaymentIntentIds: ["pi_1"] }));
    await billingRoutes.webhook(hook(event("evt_r", "charge.refunded", { customer: "cus_1", payment_intent: "pi_1" })), env, makeCtx());
    expect((await entRow(env, id))?.status).toBe("none");
  });

  it("beta is never touched by a webhook", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { stripe_customer_id: "cus_1" });
    await setEntitlement(env, id, { status: "beta", plan: "beta" });
    entitlementFor.mockResolvedValue(d({}));
    await billingRoutes.webhook(hook(event("evt_bt", "invoice.paid", { customer: "cus_1" })), env, makeCtx());
    expect((await entRow(env, id))?.status).toBe("beta");
  });

  it("a Stripe failure → 500 and the event is forgotten so the retry runs", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { stripe_customer_id: "cus_1" });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    entitlementFor.mockRejectedValueOnce(new Error("stripe down"));
    const payload = event("evt_f", "invoice.paid", { customer: "cus_1" });
    expect((await billingRoutes.webhook(hook(payload), env, makeCtx())).status).toBe(500);
    entitlementFor.mockResolvedValue(d({}));
    expect((await billingRoutes.webhook(hook(payload), env, makeCtx())).status).toBe(200);
    expect((await entRow(env, id))?.status).toBe("active");
    err.mockRestore();
  });
});

describe("dispute events", () => {
  it("finds the user by the Lifetime payment intent", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { stripe_customer_id: "cus_9" });
    await env.DB.prepare(
      "INSERT INTO entitlements (user_id, plan, status, stripe_payment_intent_id, updated_at) VALUES (?, 'lifetime', 'lifetime', 'pi_9', 1)",
    )
      .bind(id)
      .run();
    entitlementFor.mockResolvedValue(d({ status: "none" }));
    const res = await billingRoutes.webhook(
      hook(event("evt_dispute_pi", "charge.dispute.created", { id: "dp_1", payment_intent: "pi_9", charge: "ch_1" })),
      env,
      makeCtx(),
    );
    expect(res.status).toBe(200);
    expect(entitlementFor).toHaveBeenCalledWith(expect.anything(), "cus_9");
  });
});
