import { describe, expect, it } from "vitest";
import { PAST_DUE_GRACE_MS } from "../src/contract";
import {
  deriveEntitlement,
  readEntitlement,
  writeEntitlement,
  type DerivedEntitlement,
  type LifetimeInput,
  type SubInput,
} from "../src/entitlement";
import { addUser, entRow, makeEnv, setEntitlement, userRow } from "./billing-helpers";

const PRICES = { monthly: "price_monthly", annual: "price_annual", lifetime: "price_lifetime" };
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 10);

const sub = (o: Partial<SubInput> = {}): SubInput => ({
  id: "sub_1",
  status: "active",
  cancelAtPeriodEnd: false,
  cancelAt: null,
  trialEnd: null,
  periodEnd: NOW + 30 * DAY,
  priceId: "price_monthly",
  metaPlan: null,
  currency: "eur",
  created: NOW - DAY,
  ...o,
});
const life = (o: Partial<LifetimeInput> = {}): LifetimeInput => ({
  paymentIntentId: "pi_1",
  currency: "pln",
  created: NOW - DAY,
  revoked: false,
  ...o,
});

describe("§5 table", () => {
  it("none: no purchase", () => {
    const d = deriveEntitlement([], [], PRICES);
    expect(d).toMatchObject({ status: "none", plan: null, until: null, trialStarted: false });
  });

  it.each(["canceled", "unpaid", "incomplete", "incomplete_expired"])("none: subscription %s", (status) => {
    const d = deriveEntitlement([sub({ status })], [], PRICES);
    expect(d).toMatchObject({ status: "none", plan: null, until: null, subscriptionId: "sub_1" });
  });

  it("trialing: until = trial end, trial started", () => {
    const d = deriveEntitlement([sub({ status: "trialing", trialEnd: NOW + 3 * DAY, priceId: "price_annual" })], [], PRICES);
    expect(d).toMatchObject({ status: "trialing", plan: "annual", until: NOW + 3 * DAY, trialEnd: NOW + 3 * DAY, trialStarted: true });
  });

  it("active: until = item current_period_end", () => {
    const d = deriveEntitlement([sub()], [], PRICES);
    expect(d).toMatchObject({ status: "active", plan: "monthly", until: NOW + 30 * DAY, currency: "eur" });
  });

  it("past_due: period end + 7 days", () => {
    const d = deriveEntitlement([sub({ status: "past_due" })], [], PRICES);
    expect(d).toMatchObject({ status: "past_due", until: NOW + 30 * DAY + PAST_DUE_GRACE_MS });
  });

  it("canceling: active with cancel_at_period_end → period end", () => {
    const d = deriveEntitlement([sub({ cancelAtPeriodEnd: true })], [], PRICES);
    expect(d).toMatchObject({ status: "canceling", until: NOW + 30 * DAY });
  });

  it("canceling: trialing with cancel_at_period_end → trial end", () => {
    const d = deriveEntitlement(
      [sub({ status: "trialing", trialEnd: NOW + 2 * DAY, periodEnd: NOW + 2 * DAY, cancelAtPeriodEnd: true })],
      [],
      PRICES,
    );
    expect(d).toMatchObject({ status: "canceling", until: NOW + 2 * DAY });
  });

  it("canceling: a scheduled cancel_at", () => {
    const d = deriveEntitlement([sub({ cancelAt: NOW + 10 * DAY })], [], PRICES);
    expect(d).toMatchObject({ status: "canceling", until: NOW + 10 * DAY });
  });

  it("lifetime: paid Lifetime checkout wins over a subscription", () => {
    const d = deriveEntitlement([sub()], [life()], PRICES);
    expect(d).toMatchObject({ status: "lifetime", plan: "lifetime", until: null, paymentIntentId: "pi_1", currency: "pln" });
    expect(d.liveSubscriptionIds).toEqual(["sub_1"]);
  });

  it("lifetime refunded or disputed → back to the subscriptions", () => {
    const d = deriveEntitlement([sub()], [life({ revoked: true })], PRICES);
    expect(d).toMatchObject({ status: "active", plan: "monthly", revokedPaymentIntentIds: ["pi_1"] });
    expect(deriveEntitlement([], [life({ revoked: true })], PRICES).status).toBe("none");
  });

  it("several subscriptions: the one with access wins over an old canceled one", () => {
    const d = deriveEntitlement(
      [sub({ id: "sub_old", status: "canceled", created: NOW - 90 * DAY }), sub({ id: "sub_new", priceId: "price_annual" })],
      [],
      PRICES,
    );
    expect(d).toMatchObject({ status: "active", plan: "annual", subscriptionId: "sub_new" });
    expect(d.liveSubscriptionIds).toEqual(["sub_new"]);
  });

  it("plan falls back to metadata.plan", () => {
    expect(deriveEntitlement([sub({ priceId: "price_other", metaPlan: "annual" })], [], PRICES).plan).toBe("annual");
  });
});

const derived = (o: Partial<DerivedEntitlement>): DerivedEntitlement => ({
  status: "active",
  plan: "monthly",
  until: NOW + 30 * DAY,
  trialEnd: null,
  subscriptionId: "sub_1",
  paymentIntentId: null,
  currency: "eur",
  trialStarted: false,
  liveSubscriptionIds: [],
  revokedPaymentIntentIds: [],
  ...o,
});

describe("writeEntitlement precedence and side effects", () => {
  it("writes a new row, marks the list dirty and sets trial_used", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { list_attempts: 5 });
    const r = await writeEntitlement(env.DB, id, derived({ status: "trialing", trialStarted: true, trialEnd: NOW + DAY }), NOW);
    expect(r).toEqual({ changed: true, written: true });
    expect(await entRow(env, id)).toMatchObject({ status: "trialing", plan: "monthly", currency: "eur" });
    expect(await userRow(env, id)).toMatchObject({ list_dirty: 1, list_attempts: 0, trial_used: 1 });
  });

  it("same plan and status: no list change", async () => {
    const env = await makeEnv();
    const id = await addUser(env);
    await writeEntitlement(env.DB, id, derived({}), NOW);
    await env.DB.prepare("UPDATE users SET list_dirty = 0").run();
    const r = await writeEntitlement(env.DB, id, derived({ until: NOW + 60 * DAY }), NOW);
    expect(r.changed).toBe(false);
    expect((await entRow(env, id))?.until).toBe(NOW + 60 * DAY);
    expect((await userRow(env, id))?.list_dirty).toBe(0);
  });

  it("never overwrites beta", async () => {
    const env = await makeEnv();
    const id = await addUser(env);
    await setEntitlement(env, id, { status: "beta", plan: "beta" });
    const r = await writeEntitlement(env.DB, id, derived({ status: "lifetime", plan: "lifetime", until: null }), NOW);
    expect(r.written).toBe(false);
    expect((await entRow(env, id))?.status).toBe("beta");
    expect((await userRow(env, id))?.list_dirty).toBe(0);
  });

  it("never overwrites lifetime with a subscription state", async () => {
    const env = await makeEnv();
    const id = await addUser(env);
    await setEntitlement(env, id, { status: "lifetime", plan: "lifetime", pi: "pi_1" });
    await writeEntitlement(env.DB, id, derived({ status: "none", plan: null }), NOW);
    expect((await entRow(env, id))?.status).toBe("lifetime");
  });

  it("a refund or dispute of that Lifetime drops it to the subscription state", async () => {
    const env = await makeEnv();
    const id = await addUser(env);
    await setEntitlement(env, id, { status: "lifetime", plan: "lifetime", pi: "pi_1" });
    const r = await writeEntitlement(env.DB, id, derived({ status: "none", plan: null, subscriptionId: null, revokedPaymentIntentIds: ["pi_1"] }), NOW);
    expect(r.changed).toBe(true);
    expect(await entRow(env, id)).toMatchObject({ status: "none", plan: null, stripe_payment_intent_id: "pi_1" });
    expect((await userRow(env, id))?.list_dirty).toBe(1);
  });

  it("a refund of another payment does not drop lifetime", async () => {
    const env = await makeEnv();
    const id = await addUser(env);
    await setEntitlement(env, id, { status: "lifetime", plan: "lifetime", pi: "pi_1" });
    await writeEntitlement(env.DB, id, derived({ status: "none", plan: null, revokedPaymentIntentIds: ["pi_2"] }), NOW);
    expect((await entRow(env, id))?.status).toBe("lifetime");
  });
});

describe("writeEntitlement under concurrency", () => {
  it("a Stripe state read earlier never overwrites one read later (last read wins)", async () => {
    const env = await makeEnv();
    const id = await addUser(env);
    // the fresh read (canceled) lands first, the stale one (active) second
    await writeEntitlement(env.DB, id, derived({ status: "none", plan: null }), NOW, { readAt: NOW + 2 });
    await env.DB.prepare("UPDATE users SET list_dirty = 0").run();
    const r = await writeEntitlement(env.DB, id, derived({}), NOW, { readAt: NOW + 1 });
    expect(r).toEqual({ changed: false, written: false });
    expect(await entRow(env, id)).toMatchObject({ status: "none", read_at: NOW + 2 });
    expect((await userRow(env, id))?.list_dirty).toBe(0);
    // an equal or later read applies
    const later = await writeEntitlement(env.DB, id, derived({}), NOW, { readAt: NOW + 2 });
    expect(later).toEqual({ changed: true, written: true });
    expect(await entRow(env, id)).toMatchObject({ status: "active", read_at: NOW + 2 });
  });

  it("parallel writes: the list is marked dirty only by a write that changed plan or status", async () => {
    const env = await makeEnv();
    const id = await addUser(env);
    await setEntitlement(env, id, { status: "active", plan: "monthly" });
    const results = await Promise.all([
      writeEntitlement(env.DB, id, derived({ until: NOW + 40 * DAY }), NOW, { readAt: NOW }),
      writeEntitlement(env.DB, id, derived({ until: NOW + 41 * DAY }), NOW, { readAt: NOW + 1 }),
    ]);
    expect(results.every((r) => !r.changed)).toBe(true);
    expect((await userRow(env, id))?.list_dirty).toBe(0);
    expect((await entRow(env, id))?.until).toBe(NOW + 41 * DAY);
  });

  it("a started trial is recorded in trial_history when a key is given", async () => {
    const env = await makeEnv();
    const id = await addUser(env);
    await writeEntitlement(env.DB, id, derived({ status: "trialing", trialStarted: true }), NOW, { trialKey: "k1" });
    await writeEntitlement(env.DB, id, derived({ status: "trialing", trialStarted: true }), NOW, { trialKey: "k1" });
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM trial_history WHERE email_hash = 'k1'").first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("lifetime without a stored payment intent drops on any revoked purchase", async () => {
    const env = await makeEnv();
    const id = await addUser(env);
    await setEntitlement(env, id, { status: "lifetime", plan: "lifetime" });
    await writeEntitlement(env.DB, id, derived({ status: "none", plan: null }), NOW);
    expect((await entRow(env, id))?.status).toBe("lifetime");
    await writeEntitlement(env.DB, id, derived({ status: "none", plan: null, revokedPaymentIntentIds: ["pi_x"] }), NOW);
    expect((await entRow(env, id))?.status).toBe("none");
  });
});

describe("readEntitlement", () => {
  it("missing row → none, with trial_used", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { trial_used: 1 });
    expect(await readEntitlement(env.DB, id, NOW)).toEqual({
      status: "none", plan: null, access: false, until: null, trialEnd: null, trialUsed: true, checkedAt: NOW,
    });
  });

  it("beta and lifetime: access, no until", async () => {
    const env = await makeEnv();
    const a = await addUser(env);
    const b = await addUser(env);
    await setEntitlement(env, a, { status: "beta", plan: "beta" });
    await setEntitlement(env, b, { status: "lifetime", plan: "lifetime" });
    expect(await readEntitlement(env.DB, a, NOW)).toMatchObject({ status: "beta", plan: "beta", access: true, until: null });
    expect(await readEntitlement(env.DB, b, NOW)).toMatchObject({ status: "lifetime", access: true, until: null });
  });

  it("access ends at until", async () => {
    const env = await makeEnv();
    const id = await addUser(env);
    await setEntitlement(env, id, { status: "past_due", plan: "monthly", until: NOW + 1000 });
    expect((await readEntitlement(env.DB, id, NOW)).access).toBe(true);
    expect((await readEntitlement(env.DB, id, NOW + 1000)).access).toBe(false);
  });

  it("none never has access", async () => {
    const env = await makeEnv();
    const id = await addUser(env);
    await setEntitlement(env, id, { status: "none", until: NOW + DAY });
    expect(await readEntitlement(env.DB, id, NOW)).toMatchObject({ access: false, until: null, plan: null });
  });
});
