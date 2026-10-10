import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelNow,
  createCheckout,
  createPortalUrl,
  deleteCustomer,
  entitlementFor,
  toLifetimeInput,
} from "../src/stripe";
import type { Env } from "../src/env";

// The real module over a mocked fetch: checks what goes over the wire.
type Req = { method: string; path: string; params: URLSearchParams };
let reqs: Req[] = [];
let route: (r: Req) => { status?: number; body: unknown } = () => ({ body: {} });

const env = {
  STRIPE_SECRET_KEY: "sk_test_wire",
  STRIPE_WEBHOOK_SECRET: "whsec",
  APP_URL: "https://polishup.app",
  PRICE_MONTHLY: "price_monthly",
  PRICE_ANNUAL: "price_annual",
  PRICE_LIFETIME: "price_lifetime",
} as Env;
const user = { id: "u1", email: "a@example.com", createdAt: 1, marketingConsent: false };

beforeEach(() => {
  reqs = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const params = method === "GET" || method === "DELETE" ? url.searchParams : new URLSearchParams(String(init?.body ?? ""));
    const r: Req = { method, path: url.pathname, params };
    reqs.push(r);
    const out = route(r);
    return new Response(JSON.stringify(out.body), {
      status: out.status ?? 200,
      headers: { "Content-Type": "application/json", "request-id": "req_1" },
    });
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("createCheckout (§9.2)", () => {
  it("subscription with trial: creates the customer, managed_payments on", async () => {
    route = (r) =>
      r.path === "/v1/customers" ? { body: { id: "cus_1", object: "customer" } } : { body: { id: "cs_1", url: "https://checkout.stripe.com/c/1" } };
    const out = await createCheckout(env, { user, customerId: null, plan: "annual", currency: "pln", trial: true });
    expect(out).toEqual({ url: "https://checkout.stripe.com/c/1", customerId: "cus_1" });
    expect(reqs[0].path).toBe("/v1/customers");
    expect(reqs[0].params.get("email")).toBe("a@example.com");
    expect(reqs[0].params.get("metadata[user_id]")).toBe("u1");
    const p = reqs[1].params;
    expect(reqs[1].path).toBe("/v1/checkout/sessions");
    expect(Object.fromEntries(p)).toEqual({
      mode: "subscription",
      "line_items[0][price]": "price_annual",
      "line_items[0][quantity]": "1",
      currency: "pln",
      customer: "cus_1",
      client_reference_id: "u1",
      "metadata[user_id]": "u1",
      "metadata[plan]": "annual",
      "managed_payments[enabled]": "true",
      success_url: "https://polishup.app/billing?checkout=done",
      cancel_url: "https://polishup.app/plans",
      "subscription_data[metadata][user_id]": "u1",
      "subscription_data[metadata][plan]": "annual",
      "subscription_data[trial_period_days]": "3",
    });
    for (const banned of ["automatic_tax", "tax_id_collection", "payment_method_types", "invoice_creation", "adaptive_pricing"]) {
      expect([...p.keys()].some((k) => k.startsWith(banned))).toBe(false);
    }
  });

  it("Lifetime: payment mode, payment_intent_data, no trial", async () => {
    route = () => ({ body: { id: "cs_2", url: "https://checkout.stripe.com/c/2" } });
    await createCheckout(env, { user, customerId: "cus_1", plan: "lifetime", currency: "eur", trial: true });
    expect(reqs).toHaveLength(1);
    const p = reqs[0].params;
    expect(p.get("mode")).toBe("payment");
    expect(p.get("line_items[0][price]")).toBe("price_lifetime");
    expect(p.get("payment_intent_data[metadata][user_id]")).toBe("u1");
    expect(p.has("subscription_data[trial_period_days]")).toBe(false);
  });

  it("no trial when trial is false", async () => {
    route = () => ({ body: { id: "cs_3", url: "https://x" } });
    await createCheckout(env, { user, customerId: "cus_1", plan: "monthly", currency: "usd", trial: false });
    expect(reqs[0].params.has("subscription_data[trial_period_days]")).toBe(false);
  });
});

describe("entitlementFor", () => {
  const T = 1_800_000_000; // seconds
  it("lists subscriptions and Lifetime sessions and applies §5", async () => {
    route = (r) =>
      r.path === "/v1/subscriptions"
        ? {
            body: {
              object: "list",
              has_more: false,
              data: [
                {
                  id: "sub_1", object: "subscription", status: "trialing", cancel_at_period_end: false, cancel_at: null,
                  trial_end: T, currency: "eur", created: T - 100, metadata: {},
                  items: { data: [{ current_period_end: T, price: { id: "price_annual" } }] },
                },
              ],
            },
          }
        : { body: { object: "list", has_more: false, data: [] } };
    const d = await entitlementFor(env, "cus_1");
    expect(d).toMatchObject({ status: "trialing", plan: "annual", until: T * 1000, trialEnd: T * 1000, trialStarted: true });
    const sessions = reqs.find((r) => r.path === "/v1/checkout/sessions")!;
    expect(sessions.params.get("customer")).toBe("cus_1");
    expect(sessions.params.get("expand[0]")).toBe("data.payment_intent.latest_charge");
    expect(reqs.find((r) => r.path === "/v1/subscriptions")!.params.get("status")).toBe("all");
  });

  it("a paid Lifetime session → lifetime; refunded or disputed → revoked", () => {
    const s = (charge: object) =>
      ({
        mode: "payment", payment_status: "paid", metadata: { plan: "lifetime" }, currency: "usd", created: T,
        payment_intent: { id: "pi_1", status: "succeeded", latest_charge: { refunded: false, disputed: false, ...charge } },
      }) as never;
    expect(toLifetimeInput(s({}), "price_lifetime")).toEqual({ paymentIntentId: "pi_1", currency: "usd", created: T * 1000, revoked: false });
    expect(toLifetimeInput(s({ refunded: true }), "price_lifetime")?.revoked).toBe(true);
    expect(toLifetimeInput(s({ disputed: true }), "price_lifetime")?.revoked).toBe(true);
    expect(toLifetimeInput(s({ disputed: true }), "price_lifetime", new Set(["pi_1"]))?.revoked).toBe(false);
    expect(toLifetimeInput(s({ disputed: true, refunded: true }), "price_lifetime", new Set(["pi_1"]))?.revoked).toBe(true);
    expect(toLifetimeInput({ mode: "payment", payment_status: "unpaid", metadata: { plan: "lifetime" } } as never, "price_lifetime")).toBeNull();
    expect(toLifetimeInput({ mode: "subscription", payment_status: "paid", metadata: {} } as never, "price_lifetime")).toBeNull();
  });
});

describe("portal, cancel, delete", () => {
  it("portal returns to /billing", async () => {
    route = () => ({ body: { url: "https://billing.stripe.com/p/1" } });
    expect(await createPortalUrl(env, "cus_1")).toEqual({ url: "https://billing.stripe.com/p/1" });
    expect(reqs[0].params.get("return_url")).toBe("https://polishup.app/billing");
  });

  it("cancelNow and deleteCustomer accept an already-gone object, rethrow other errors", async () => {
    const missing = { status: 404, body: { error: { type: "invalid_request_error", code: "resource_missing", message: "No such" } } };
    route = () => missing;
    await expect(cancelNow(env, "sub_x")).resolves.toBeUndefined();
    await expect(deleteCustomer(env, "cus_x")).resolves.toBeUndefined();
    expect(reqs.map((r) => `${r.method} ${r.path}`)).toEqual(["DELETE /v1/subscriptions/sub_x", "DELETE /v1/customers/cus_x"]);
    route = () => ({ status: 400, body: { error: { type: "invalid_request_error", message: "bad" } } });
    await expect(deleteCustomer(env, "cus_x")).rejects.toThrow();
  });
});
