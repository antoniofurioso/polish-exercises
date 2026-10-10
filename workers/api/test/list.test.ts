import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { removeContact, segmentFor, syncContact, unsubSignature, unsubUrl } from "../src/list";
import { billingRoutes } from "../src/billing";
import { addUser, makeCtx, makeEnv, setEntitlement, userRow } from "./billing-helpers";

type Call = { method: string; path: string; body: unknown };
let calls: Call[] = [];
let respond: (c: Call) => Response = () => new Response("{}", { status: 200 });

beforeEach(() => {
  calls = [];
  respond = () => new Response("{}", { status: 200 });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const c: Call = {
      method: init?.method ?? "GET",
      path: decodeURIComponent(url.pathname),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(c);
    return respond(c);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("segmentFor", () => {
  const base = { trial_used: 0, stripe_subscription_id: null, stripe_payment_intent_id: null, list_synced: null };
  it.each([
    ["beta", "beta", "beta"],
    ["lifetime", "lifetime", "lifetime"],
    ["trialing", "annual", "trialing"],
    ["active", "monthly", "monthly"],
    ["past_due", "annual", "annual"],
    ["canceling", "monthly", "monthly"],
  ])("%s %s → %s", (status, plan, want) => {
    expect(segmentFor({ ...base, status, plan })).toBe(want);
  });
  it("none without a past plan → no segment; after one → former", () => {
    expect(segmentFor({ ...base, status: null, plan: null })).toBeNull();
    expect(segmentFor({ ...base, status: "none", plan: null, stripe_subscription_id: "sub_1" })).toBe("former");
    expect(segmentFor({ ...base, status: "none", plan: null, list_synced: "annual|0" })).toBe("former");
  });
});

describe("syncContact", () => {
  it("creates the contact in its segment, unsubscribed without consent", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { email: "a@example.com", list_dirty: 1 });
    await setEntitlement(env, id, { status: "beta", plan: "beta" });
    await syncContact(env, id);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "POST", path: "/contacts" });
    expect(calls[0].body).toEqual({
      email: "a@example.com",
      unsubscribed: true,
      properties: { user_id: id, plan: "beta", unsub_url: await unsubUrl(env, id) },
      segments: [{ id: "seg_beta" }],
    });
    expect(await userRow(env, id)).toMatchObject({ list_synced: "beta|0", list_dirty: 0, list_attempts: 0 });
  });

  it("is idempotent: a second run makes no call", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { list_dirty: 1, marketing_consent: 1 });
    await setEntitlement(env, id, { status: "beta", plan: "beta" });
    await syncContact(env, id);
    await syncContact(env, id);
    expect(calls).toHaveLength(1);
    expect((calls[0].body as { unsubscribed: boolean }).unsubscribed).toBe(false);
  });

  it("moves the contact between segments", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { email: "m@example.com", list_synced: "trialing|1", list_dirty: 1, marketing_consent: 1 });
    await setEntitlement(env, id, { status: "active", plan: "annual" });
    await syncContact(env, id);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "PATCH /contacts/m@example.com",
      "DELETE /contacts/m@example.com/segments/seg_trialing",
      "POST /contacts/m@example.com/segments/seg_annual",
    ]);
    expect(await userRow(env, id)).toMatchObject({ list_synced: "annual|1", list_dirty: 0 });
  });

  it("plan ended → former", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { email: "f@example.com", list_synced: "monthly|0", list_dirty: 1 });
    await setEntitlement(env, id, { status: "none", sub: "sub_1" });
    await syncContact(env, id);
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/contacts/f@example.com/segments/seg_former" });
    expect((await userRow(env, id))?.list_synced).toBe("former|0");
  });

  it("consent change only: one PATCH", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { email: "c@example.com", list_synced: "beta|1", list_dirty: 1, marketing_consent: 0 });
    await setEntitlement(env, id, { status: "beta", plan: "beta" });
    await syncContact(env, id);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "PATCH", body: { unsubscribed: true } });
  });

  it("existing contact on create → update and join the segment", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { email: "e@example.com", list_dirty: 1 });
    await setEntitlement(env, id, { status: "lifetime", plan: "lifetime" });
    respond = (c) => new Response("{}", { status: c.path === "/contacts" ? 409 : 200 });
    await syncContact(env, id);
    expect(calls.map((c) => c.method)).toEqual(["POST", "PATCH", "POST"]);
    expect((await userRow(env, id))?.list_synced).toBe("lifetime|0");
  });

  it("a failure leaves it dirty and bumps attempts; never throws", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { list_dirty: 1 });
    await setEntitlement(env, id, { status: "beta", plan: "beta" });
    respond = () => new Response("{}", { status: 500 });
    await expect(syncContact(env, id)).resolves.toBeUndefined();
    expect(await userRow(env, id)).toMatchObject({ list_dirty: 1, list_attempts: 1, list_synced: null });
    vi.stubGlobal("fetch", async () => {
      throw new Error("network");
    });
    await syncContact(env, id);
    expect((await userRow(env, id))?.list_attempts).toBe(2);
  });

  it("a missing segment id is a failure", async () => {
    const env = await makeEnv({ RESEND_SEGMENTS: "{}" });
    const id = await addUser(env, { list_dirty: 1 });
    await setEntitlement(env, id, { status: "beta", plan: "beta" });
    await syncContact(env, id);
    expect(calls).toHaveLength(0);
    expect((await userRow(env, id))?.list_dirty).toBe(1);
  });
});

describe("removeContact", () => {
  it("deletes by email; 404 and network errors never throw", async () => {
    const env = await makeEnv();
    await removeContact(env, "x@example.com");
    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/contacts/x@example.com" });
    respond = () => new Response("{}", { status: 404 });
    await expect(removeContact(env, "x@example.com")).resolves.toBeUndefined();
    vi.stubGlobal("fetch", async () => {
      throw new Error("down");
    });
    await expect(removeContact(env, "x@example.com")).resolves.toBeUndefined();
  });
});

describe("/email/unsubscribe", () => {
  const link = async (
    env: Awaited<ReturnType<typeof makeEnv>>,
    id: string,
    method: string,
    sig?: string,
    body = "List-Unsubscribe=One-Click",
  ) =>
    billingRoutes.unsubscribe(
      new Request(`https://api.polishup.app/email/unsubscribe?u=${id}&s=${sig ?? (await unsubSignature(env, id))}`, {
        method,
        ...(method === "POST" ? { body, headers: { "Content-Type": "application/x-www-form-urlencoded" } } : {}),
      }),
      env,
      makeCtx(),
    );

  it("signature is HMAC-SHA256 hex", async () => {
    const env = await makeEnv();
    expect(await unsubSignature(env, "u1")).toMatch(/^[0-9a-f]{64}$/);
    expect(await unsubUrl(env, "u1")).toBe(`https://api.polishup.app/email/unsubscribe?u=u1&s=${await unsubSignature(env, "u1")}`);
  });

  it("GET with a good link only asks: consent unchanged (mail scanners open links)", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { marketing_consent: 1 });
    const res = await link(env, id, "GET");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const page = await res.text();
    expect(page).toContain('<form method="post"');
    expect(page).toContain('name="confirm"');
    expect((await userRow(env, id))?.marketing_consent).toBe(1);
  });

  it("confirm button POST: HTML page, consent withdrawn, list dirty", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { marketing_consent: 1 });
    const res = await link(env, id, "POST", undefined, "confirm=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(await res.text()).toContain("You are unsubscribed");
    expect(await userRow(env, id)).toMatchObject({
      marketing_consent: 0,
      marketing_consent_source: "unsubscribe",
      list_dirty: 1,
    });
  });

  it("POST one-click: { ok: true }; repeat is a no-op", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { marketing_consent: 1 });
    const res = await link(env, id, "POST");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    await env.DB.prepare("UPDATE users SET list_dirty = 0").run();
    expect((await link(env, id, "POST")).status).toBe(200);
    expect((await userRow(env, id))?.list_dirty).toBe(0);
  });

  it("bad or missing signature → 400 bad_link, nothing changed", async () => {
    const env = await makeEnv();
    const id = await addUser(env, { marketing_consent: 1 });
    const other = await unsubSignature({ UNSUB_SECRET: "other" }, id);
    for (const sig of [other, "", "zz", (await unsubSignature(env, id)).slice(0, 63) + "0"]) {
      const res = await link(env, id, "GET", sig);
      if (sig === (await unsubSignature(env, id))) continue;
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "bad_link" });
    }
    expect((await link(env, "", "POST", "")).status).toBe(400);
    expect((await userRow(env, id))?.marketing_consent).toBe(1);
  });
});
