import { beforeEach, describe, expect, it, vi } from "vitest";
import * as stripeMod from "../src/stripe";
import {
  CRON_MAX_LIST_USERS,
  CRON_MAX_REMINDERS,
  CRON_MAX_SUBREQUESTS,
  billingRoutes,
  deleteBillingFor,
  lifetimeOfferOpen,
  runBillingCron,
} from "../src/billing";
import { trialKey } from "../src/auth";
import { EMAIL_BUDGETS } from "../src/email";
import type { DerivedEntitlement } from "../src/entitlement";
import { addUser, authed, entRow, makeCtx, makeEnv, post, setEntitlement, userRow } from "./billing-helpers";

vi.mock("../src/stripe", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/stripe")>();
  return {
    ...m,
    createCheckout: vi.fn(),
    createPortalUrl: vi.fn(),
    entitlementFor: vi.fn(),
    liveSubscriptionIds: vi.fn(),
    cancelNow: vi.fn(),
    deleteCustomer: vi.fn(),
  };
});
const S = {
  createCheckout: vi.mocked(stripeMod.createCheckout),
  createPortalUrl: vi.mocked(stripeMod.createPortalUrl),
  entitlementFor: vi.mocked(stripeMod.entitlementFor),
  liveSubscriptionIds: vi.mocked(stripeMod.liveSubscriptionIds),
  cancelNow: vi.mocked(stripeMod.cancelNow),
  deleteCustomer: vi.mocked(stripeMod.deleteCustomer),
};

const DAY = 86_400_000;
type FetchCall = { url: string; body: unknown };
let fetches: FetchCall[] = [];
let fetchStatus = 200;

beforeEach(() => {
  for (const f of Object.values(S)) f.mockReset();
  S.liveSubscriptionIds.mockResolvedValue([]);
  fetches = [];
  fetchStatus = 200;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    fetches.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify({ id: "email_1" }), { status: fetchStatus });
  });
});

const checkout = async (env: Awaited<ReturnType<typeof makeEnv>>, id: string, body: unknown) =>
  billingRoutes.checkout(post("/billing/checkout", body), env, makeCtx(), authed(id));

describe("POST /billing/checkout", () => {
  it("400 on a bad plan, currency or body", async () => {
    const env = await makeEnv();
    const id = await addUser(env);
    for (const body of [{ plan: "weekly", currency: "eur" }, { plan: "annual", currency: "gbp" }, "nope", {}]) {
      const res = await checkout(env, id, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "bad_request" });
    }
    expect(S.createCheckout).not.toHaveBeenCalled();
  });

  it("first checkout: trial offered, customer id stored", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { email: "new@example.com" });
    S.createCheckout.mockResolvedValue({ url: "https://checkout.stripe.com/c/1", customerId: "cus_new" });
    const res = await checkout(env, id, { plan: "annual", currency: "pln" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/1" });
    expect(S.createCheckout).toHaveBeenCalledWith(env, expect.objectContaining({
      plan: "annual", currency: "pln", trial: true, customerId: null,
      user: expect.objectContaining({ id, email: "new@example.com" }),
    }));
    expect((await userRow(env, id))?.stripe_customer_id).toBe("cus_new");
  });

  it("trial only once: no trial when trial_used", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { trial_used: 1, stripe_customer_id: "cus_1" });
    await setEntitlement(env, id, { status: "none", sub: "sub_old" });
    S.createCheckout.mockResolvedValue({ url: "https://x", customerId: "cus_1" });
    await checkout(env, id, { plan: "monthly", currency: "eur" });
    expect(S.createCheckout).toHaveBeenCalledWith(env, expect.objectContaining({ trial: false, customerId: "cus_1" }));
  });

  it("no trial for an email whose earlier account had one (trial_history)", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { email: "again@example.com" });
    await env.DB.prepare("INSERT INTO trial_history (email_hash) VALUES (?)").bind(await trialKey(env, "again@example.com")).run();
    S.createCheckout.mockResolvedValue({ url: "https://x", customerId: "cus_2" });
    await checkout(env, id, { plan: "annual", currency: "eur" });
    expect(S.createCheckout).toHaveBeenCalledWith(env, expect.objectContaining({ trial: false }));
  });

  it("409 already_subscribed when Stripe has a live subscription D1 does not know yet", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { stripe_customer_id: "cus_1" });
    S.liveSubscriptionIds.mockResolvedValue(["sub_new"]);
    const res = await checkout(env, id, { plan: "monthly", currency: "eur" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "already_subscribed" });
    expect(S.liveSubscriptionIds).toHaveBeenCalledWith(env, "cus_1");
    expect(S.createCheckout).not.toHaveBeenCalled();
    // Lifetime is still allowed (the subscription is cancelled after the purchase)
    S.createCheckout.mockResolvedValue({ url: "https://x", customerId: "cus_1" });
    expect((await checkout(env, id, { plan: "lifetime", currency: "eur" })).status).toBe(200);
  });

  it("409 already_subscribed with access; a subscriber may still buy Lifetime", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { stripe_customer_id: "cus_1" });
    await setEntitlement(env, id, { status: "active", plan: "monthly", until: Date.now() + 10 * DAY });
    const res = await checkout(env, id, { plan: "annual", currency: "eur" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "already_subscribed" });
    S.createCheckout.mockResolvedValue({ url: "https://x", customerId: "cus_1" });
    expect((await checkout(env, id, { plan: "lifetime", currency: "eur" })).status).toBe(200);
  });

  it.each(["beta", "lifetime"])("409 has_lifetime_or_beta for %s", async (status) => {
    const env = await makeEnv();
    const id = await addUser(env);
    await setEntitlement(env, id, { status, plan: status });
    for (const plan of ["monthly", "lifetime"]) {
      const res = await checkout(env, id, { plan, currency: "eur" });
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: "has_lifetime_or_beta" });
    }
  });

  it("Lifetime before and after the offer end", async () => {
    const now = Date.now();
    const open = await makeEnv({ LIFETIME_OFFER_UNTIL: new Date(now + DAY).toISOString() });
    const id = await addUser(open);
    S.createCheckout.mockResolvedValue({ url: "https://x", customerId: "cus_1" });
    expect((await checkout(open, id, { plan: "lifetime", currency: "usd" })).status).toBe(200);
    expect(S.createCheckout).toHaveBeenCalledWith(open, expect.objectContaining({ plan: "lifetime" }));

    for (const until of [new Date(now - 1000).toISOString(), "", "not a date"]) {
      const env = await makeEnv({ LIFETIME_OFFER_UNTIL: until });
      const uid = await addUser(env);
      const res = await checkout(env, uid, { plan: "lifetime", currency: "usd" });
      expect(res.status).toBe(410);
      expect(await res.json()).toMatchObject({ error: "offer_ended" });
    }
    expect(lifetimeOfferOpen({ LIFETIME_OFFER_UNTIL: "2026-10-10" }, Date.UTC(2026, 9, 10))).toBe(false);
    expect(lifetimeOfferOpen({ LIFETIME_OFFER_UNTIL: "2026-10-10" }, Date.UTC(2026, 9, 9))).toBe(true);
  });

  it("Stripe failure → 502 stripe_error", async () => {
    const env = await makeEnv();
    const id = await addUser(env);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    S.createCheckout.mockRejectedValue(new Error("down"));
    expect((await checkout(env, id, { plan: "monthly", currency: "eur" })).status).toBe(502);
    err.mockRestore();
  });
});

const derived = (o: Partial<DerivedEntitlement>): DerivedEntitlement => ({
  status: "trialing",
  plan: "annual",
  until: Date.now() + 3 * DAY,
  trialEnd: Date.now() + 3 * DAY,
  subscriptionId: "sub_1",
  paymentIntentId: null,
  currency: "eur",
  trialStarted: true,
  liveSubscriptionIds: ["sub_1"],
  revokedPaymentIntentIds: [],
  ...o,
});

describe("POST /billing/refresh and /billing/portal", () => {
  it("refresh without a customer returns the stored entitlement", async () => {
    const env = await makeEnv();
    const id = await addUser(env);
    const res = await billingRoutes.refresh(post("/billing/refresh"), env, makeCtx(), authed(id));
    expect(await res.json()).toMatchObject({ entitlement: { status: "none", access: false } });
    expect(S.entitlementFor).not.toHaveBeenCalled();
  });

  it("refresh re-reads Stripe and writes the row", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { stripe_customer_id: "cus_1" });
    S.entitlementFor.mockResolvedValue(derived({}));
    const ctx = makeCtx();
    const res = await billingRoutes.refresh(post("/billing/refresh"), env, ctx, authed(id));
    await ctx.settle();
    expect(await res.json()).toMatchObject({ entitlement: { status: "trialing", plan: "annual", access: true, trialUsed: true } });
    expect((await entRow(env, id))?.status).toBe("trialing");
  });

  it("portal: 409 no_customer, else the url", async () => {
    const env = await makeEnv();
    const a = await addUser(env);
    const res = await billingRoutes.portal(post("/billing/portal"), env, makeCtx(), authed(a));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "no_customer" });
    const b = await addUser(env, { stripe_customer_id: "cus_1" });
    S.createPortalUrl.mockResolvedValue({ url: "https://billing.stripe.com/p/1" });
    const ok = await billingRoutes.portal(post("/billing/portal"), env, makeCtx(), authed(b));
    expect(await ok.json()).toEqual({ url: "https://billing.stripe.com/p/1" });
    expect(S.createPortalUrl).toHaveBeenCalledWith(env, "cus_1");
  });
});

describe("deleteBillingFor", () => {
  it("no customer: nothing to do", async () => {
    const env = await makeEnv();
    const id = await addUser(env);
    await deleteBillingFor(env, id);
    expect(S.liveSubscriptionIds).not.toHaveBeenCalled();
  });

  it("cancels live subscriptions now, then deletes the customer", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { stripe_customer_id: "cus_1" });
    S.liveSubscriptionIds.mockResolvedValue(["sub_1", "sub_2"]);
    await deleteBillingFor(env, id);
    expect(S.cancelNow.mock.calls.map((c) => c[1])).toEqual(["sub_1", "sub_2"]);
    expect(S.deleteCustomer).toHaveBeenCalledWith(env, "cus_1");
  });

  it("a Stripe failure throws and the customer is not deleted", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { stripe_customer_id: "cus_1" });
    S.liveSubscriptionIds.mockResolvedValue(["sub_1"]);
    S.cancelNow.mockRejectedValue(new Error("stripe down"));
    await expect(deleteBillingFor(env, id)).rejects.toThrow("stripe down");
    expect(S.deleteCustomer).not.toHaveBeenCalled();
  });
});

describe("runBillingCron", () => {
  it("sends the trial reminder once, inside 36 h of the trial end", async () => {
    const env = await makeEnv();
    const now = Date.UTC(2026, 9, 10, 12);
    const soon = await addUser(env, { email: "soon@example.com" });
    const later = await addUser(env, { email: "later@example.com" });
    const canceling = await addUser(env, { email: "cancel@example.com" });
    await setEntitlement(env, soon, { status: "trialing", plan: "annual", currency: "pln", trial_end: now + 30 * 3_600_000, until: now + 30 * 3_600_000 });
    await setEntitlement(env, later, { status: "trialing", plan: "monthly", trial_end: now + 60 * 3_600_000 });
    await setEntitlement(env, canceling, { status: "canceling", plan: "monthly", trial_end: now + 10 * 3_600_000 });

    await runBillingCron(env, now, { paceMs: 0 });
    const emails = fetches.filter((f) => f.url.endsWith("/emails"));
    expect(emails).toHaveLength(1);
    expect(emails[0].body).toMatchObject({ to: ["soon@example.com"], subject: "Your PolishUp trial ends on 11 October 2026" });
    expect(JSON.stringify(emails[0].body)).toContain("199 zł a year");
    expect(JSON.stringify(emails[0].body)).toContain("https://polishup.app/billing");
    expect((await userRow(env, soon))?.reminder_sent_at).toBe(now);

    fetches = [];
    await runBillingCron(env, now + 3_600_000, { paceMs: 0 });
    expect(fetches.filter((f) => f.url.endsWith("/emails"))).toHaveLength(0);
  });

  it("a failed send is retried next hour", async () => {
    const env = await makeEnv();
    const now = Date.now();
    const id = await addUser(env);
    await setEntitlement(env, id, { status: "trialing", plan: "annual", trial_end: now + 3_600_000 });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchStatus = 500;
    await runBillingCron(env, now, { paceMs: 0 });
    expect((await userRow(env, id))?.reminder_sent_at).toBeNull();
    fetchStatus = 200;
    await runBillingCron(env, now, { paceMs: 0 });
    expect((await userRow(env, id))?.reminder_sent_at).toBe(now);
    err.mockRestore();
  });

  it("a permanent Resend refusal (4xx but 429) is not retried; 429 is", async () => {
    const env = await makeEnv();
    const now = Date.now();
    const a = await addUser(env);
    await setEntitlement(env, a, { status: "trialing", plan: "annual", trial_end: now + 3_600_000 });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchStatus = 429;
    await runBillingCron(env, now, { paceMs: 0 });
    expect((await userRow(env, a))?.reminder_sent_at).toBeNull();
    fetchStatus = 422;
    await runBillingCron(env, now, { paceMs: 0 });
    expect((await userRow(env, a))?.reminder_sent_at).toBe(now);
    fetches = [];
    await runBillingCron(env, now + 3_600_000, { paceMs: 0 });
    expect(fetches.filter((f) => f.url.endsWith("/emails"))).toHaveLength(0);
    err.mockRestore();
  });

  it("respects the reminders' own daily budget, untouched by code emails", async () => {
    const env = await makeEnv();
    const now = Date.now();
    const id = await addUser(env);
    await setEntitlement(env, id, { status: "trialing", plan: "annual", trial_end: now + 3_600_000 });
    const day = new Date(now).toISOString().slice(0, 10);
    // code emails used up their budgets: reminders still go out
    for (const b of [EMAIL_BUDGETS.codeNew, EMAIL_BUDGETS.codeKnown]) {
      await env.DB.prepare("INSERT INTO counters (key, day, n) VALUES (?, ?, ?)").bind(b.key, day, b.cap).run();
    }
    await runBillingCron(env, now, { paceMs: 0 });
    expect(fetches.filter((f) => f.url.endsWith("/emails"))).toHaveLength(1);
    await env.DB.prepare("UPDATE users SET reminder_sent_at = NULL").run();
    await env.DB.prepare("INSERT INTO counters (key, day, n) VALUES (?, ?, ?) ON CONFLICT (key, day) DO UPDATE SET n = excluded.n")
      .bind(EMAIL_BUDGETS.reminder.key, day, EMAIL_BUDGETS.reminder.cap)
      .run();
    fetches = [];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await runBillingCron(env, now, { paceMs: 0 });
    expect(fetches).toHaveLength(0);
    err.mockRestore();
  });

  it("retries at most CRON_MAX_LIST_USERS dirty users per run, skips users past 24 attempts", async () => {
    const env = await makeEnv();
    for (let i = 0; i < CRON_MAX_LIST_USERS + 2; i++) {
      const id = await addUser(env, { list_dirty: 1 });
      await setEntitlement(env, id, { status: "beta", plan: "beta" });
    }
    const stuck = await addUser(env, { list_dirty: 1, list_attempts: 24 });
    await runBillingCron(env, Date.now(), { paceMs: 0 });
    expect(fetches.filter((f) => f.url.endsWith("/contacts"))).toHaveLength(CRON_MAX_LIST_USERS);
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE list_dirty = 1").first<{ n: number }>();
    expect(left?.n).toBe(3);
    expect((await userRow(env, stuck))?.list_attempts).toBe(24);
  });

  it("worst case run stays within CRON_MAX_SUBREQUESTS (D1 queries + fetches)", async () => {
    const env = await makeEnv();
    const now = Date.now();
    for (let i = 0; i < CRON_MAX_REMINDERS + 3; i++) {
      const id = await addUser(env);
      await setEntitlement(env, id, { status: "trialing", plan: "annual", trial_end: now + 3_600_000 });
    }
    // contacts that already exist at Resend and must join a segment: the longest sync
    for (let i = 0; i < CRON_MAX_LIST_USERS + 3; i++) {
      const id = await addUser(env, { list_dirty: 1 });
      await setEntitlement(env, id, { status: "beta", plan: "beta" });
    }
    let calls = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      const exists = String(input).endsWith("/contacts") && init?.method === "POST";
      return new Response(JSON.stringify({ id: "x" }), { status: exists ? 409 : 200 });
    });
    const db = env.DB;
    const count = <T extends object>(o: T): T =>
      new Proxy(o, {
        get(t, k) {
          const v = Reflect.get(t, k) as unknown;
          if (typeof v !== "function") return v;
          if (k === "bind") return (...a: unknown[]) => count(v.apply(t, a));
          if (k === "first" || k === "all" || k === "run" || k === "raw") {
            return (...a: unknown[]) => {
              calls++;
              return v.apply(t, a);
            };
          }
          return v.bind(t);
        },
      });
    const counted = {
      prepare: (sql: string) => count(db.prepare(sql)),
      batch: (stmts: D1PreparedStatement[]) => {
        calls++;
        return db.batch(stmts);
      },
    } as unknown as D1Database;
    await runBillingCron({ ...env, DB: counted }, now, { paceMs: 0 });
    expect(calls).toBeGreaterThan(40); // really the worst case (41 today)
    expect(calls).toBeLessThanOrEqual(CRON_MAX_SUBREQUESTS);
  });

  it("never throws", async () => {
    const env = await makeEnv();
    const broken = { ...env, DB: { prepare: () => { throw new Error("db down"); } } as unknown as D1Database };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runBillingCron(broken, Date.now(), { paceMs: 0 })).resolves.toBeUndefined();
    err.mockRestore();
  });
});
