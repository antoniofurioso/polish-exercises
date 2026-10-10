import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trialKey } from "../src/auth";
import { deleteBillingFor } from "../src/billing";
import type { ExportResponse, MeResponse } from "../src/contract";
import { removeContact, syncContact } from "../src/list";
import { sqliteOf } from "./d1";
import { type Harness, harness, signIn } from "./helpers";

vi.mock("../src/list", () => ({ syncContact: vi.fn(async () => {}), removeContact: vi.fn(async () => {}) }));
vi.mock("../src/billing", () => ({
  billingRoutes: {},
  deleteBillingFor: vi.fn(async () => {}),
  runBillingCron: vi.fn(async () => {}),
}));

let h: Harness;
let token: string;
let userId: string;
const count = (table: string) =>
  (sqliteOf(h.env.DB).prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

beforeEach(async () => {
  vi.clearAllMocks();
  h = harness();
  ({ token, user: { id: userId } } = await signIn(h, "ola@example.com"));
});
afterEach(() => vi.unstubAllGlobals());

const ev = (t: number) => ({
  t,
  day: "2026-10-10",
  card: "verbs:pisać|present",
  skill: "verbs:present",
  verdict: "correct",
  drill: "verbs",
  case: "nom",
});

describe("GET /me", () => {
  it("returns the user, the entitlement and the config", async () => {
    const res = await h.call("GET", "/me", { token, cf: { country: "PL" } });
    const body = (await res.json()) as MeResponse;
    expect(body.user).toMatchObject({ id: userId, email: "ola@example.com", marketingConsent: false });
    expect(body.entitlement).toMatchObject({ status: "beta", access: true });
    expect(body.config).toEqual({ betaOpen: true, lifetimeOfferUntil: null, currency: "pln" });
  });
});

describe("POST /account/consent", () => {
  it("gives and withdraws consent, marking the list dirty", async () => {
    sqliteOf(h.env.DB).prepare("UPDATE users SET list_dirty = 0").run();
    vi.mocked(syncContact).mockClear();
    const on = await h.call("POST", "/account/consent", { token, body: { marketing: true } });
    expect(await on.json()).toMatchObject({ user: { marketingConsent: true } });
    expect(sqliteOf(h.env.DB).prepare("SELECT marketing_consent_source s, list_dirty d FROM users").get()).toEqual({
      s: "settings:v1",
      d: 1,
    });
    expect(syncContact).toHaveBeenCalledWith(h.env, userId);
    const off = await h.call("POST", "/account/consent", { token, body: { marketing: false } });
    expect(await off.json()).toMatchObject({ user: { marketingConsent: false } });
    expect(syncContact).toHaveBeenCalledTimes(2);
    // no change, no write
    await h.call("POST", "/account/consent", { token, body: { marketing: false } });
    expect(syncContact).toHaveBeenCalledTimes(2);
  });

  it("400 for a bad body, 401 without a session", async () => {
    expect((await h.call("POST", "/account/consent", { token, body: { marketing: "yes" } })).status).toBe(400);
    expect((await h.call("POST", "/account/consent", { body: { marketing: true } })).status).toBe(401);
  });
});

describe("GET /account/export", () => {
  it("returns the user, entitlement, settings, profile and every event", async () => {
    await h.call("POST", "/sync", {
      token,
      body: {
        cursor: 0,
        events: [ev(1), ev(2)],
        settings: { value: { goal: 20, newPerDay: 10 }, updatedAt: 5 },
        profile: { value: { name: "Ola" }, updatedAt: 6 },
      },
    });
    const res = await h.call("GET", "/account/export", { token });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ExportResponse;
    expect(body.user.email).toBe("ola@example.com");
    expect(body.entitlement.status).toBe("beta");
    expect(body.settings).toEqual({ value: { goal: 20, newPerDay: 10 }, updatedAt: 5 });
    expect(body.profile).toEqual({ value: { name: "Ola" }, updatedAt: 6 });
    expect(body.events.map((e) => e.t)).toEqual([1, 2]);
  });
});

describe("DELETE /account", () => {
  it("deletes every row of the user and removes the contact", async () => {
    await h.call("POST", "/sync", {
      token,
      body: { cursor: 0, events: [ev(1)], settings: { value: { goal: 20, newPerDay: 10 }, updatedAt: 5 } },
    });
    const other = await signIn(h, "other@example.com");
    const res = await h.call("DELETE", "/account", { token });
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteBillingFor).toHaveBeenCalledWith(h.env, userId);
    expect(removeContact).toHaveBeenCalledWith(h.env, "ola@example.com");
    const left = await h.env.DB.prepare(
        `SELECT (SELECT COUNT(*) FROM users WHERE id = ?1) + (SELECT COUNT(*) FROM sessions WHERE user_id = ?1)
          + (SELECT COUNT(*) FROM events WHERE user_id = ?1) + (SELECT COUNT(*) FROM user_data WHERE user_id = ?1)
          + (SELECT COUNT(*) FROM entitlements WHERE user_id = ?1)
          + (SELECT COUNT(*) FROM login_codes WHERE email = 'ola@example.com') AS n`,
    )
      .bind(userId)
      .first();
    expect(left).toEqual({ n: 0 });
    expect(count("users")).toBe(1);
    expect((await h.call("GET", "/me", { token })).status).toBe(401);
    expect((await h.call("GET", "/me", { token: other.token })).status).toBe(200);
  });

  it("keeps a used trial in trial_history (no second trial after re-signing up)", async () => {
    sqliteOf(h.env.DB).prepare("UPDATE users SET trial_used = 1 WHERE id = ?").run(userId);
    expect((await h.call("DELETE", "/account", { token })).status).toBe(200);
    expect(count("users")).toBe(0);
    expect(sqliteOf(h.env.DB).prepare("SELECT email_hash FROM trial_history").all()).toEqual([
      { email_hash: await trialKey(h.env, "ola@example.com") },
    ]);
  });

  it("records no trial_history for a user who never had a trial", async () => {
    expect((await h.call("DELETE", "/account", { token })).status).toBe(200);
    expect(count("trial_history")).toBe(0);
  });

  it("502 and nothing deleted when Stripe fails", async () => {
    vi.mocked(deleteBillingFor).mockRejectedValueOnce(new Error("stripe down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await h.call("DELETE", "/account", { token });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "stripe_error" });
    expect(removeContact).not.toHaveBeenCalled();
    expect(count("users")).toBe(1);
    expect((await h.call("GET", "/me", { token })).status).toBe(200);
  });
});
