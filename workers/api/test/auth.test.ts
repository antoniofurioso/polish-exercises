import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CODE_TTL_MS, SESSION_TTL_MS } from "../src/contract";
import { ipKey, newCode, newToken, normaliseEmail, timingSafeEqual } from "../src/auth";
import { utcDay } from "../src/db";
import { EMAIL_BUDGETS } from "../src/email";
import { syncContact } from "../src/list";
import { sqliteOf } from "./d1";
import { type Harness, harness, lastCode, signIn } from "./helpers";

vi.mock("../src/list", () => ({ syncContact: vi.fn(async () => {}), removeContact: vi.fn(async () => {}) }));
vi.mock("../src/billing", () => ({
  billingRoutes: {},
  deleteBillingFor: vi.fn(async () => {}),
  runBillingCron: vi.fn(async () => {}),
}));

const T0 = Date.parse("2026-10-10T12:00:00Z");
let h: Harness;

const at = (ms: number) => vi.setSystemTime(ms);
const row = (sql: string, ...p: (string | number)[]) => sqliteOf(h.env.DB).prepare(sql).get(...p);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(T0);
  h = harness();
  vi.mocked(syncContact).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const start = (email: string) => h.call("POST", "/auth/start", { body: { email } });
const verify = (email: string, code: string, extra: Record<string, unknown> = {}) =>
  h.call("POST", "/auth/verify", { body: { email, code, ...extra } });

describe("helpers", () => {
  it("normalises emails and rejects junk", () => {
    expect(normaliseEmail("  Ola@Example.COM ")).toBe("ola@example.com");
    expect(normaliseEmail("nope")).toBeNull();
    expect(normaliseEmail(42)).toBeNull();
    expect(normaliseEmail(`${"a".repeat(250)}@x.pl`)).toBeNull();
  });
  it("makes 6-digit codes and 43-char base64url tokens", () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^\d{6}$/);
    expect(newToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("keys IPv4 as is and IPv6 by its /64", () => {
    expect(ipKey("1.2.3.4")).toBe("1.2.3.4");
    expect(ipKey("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::/64");
    expect(ipKey("2001:DB8:1:2::9")).toBe("2001:db8:1:2::/64");
    expect(ipKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipKey("::1")).toBe("0:0:0:0::/64");
    expect(ipKey("::ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(ipKey("2001:0db8:0001:0002:ffff::")).toBe("2001:db8:1:2::/64");
  });
  it("compares in constant time", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("POST /auth/start", () => {
  it("sends a code email and stores only its hash", async () => {
    const res = await start("Ola@Example.com");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.sent).toHaveLength(1);
    const mail = h.sent[0];
    const code = lastCode(h);
    expect(mail.to).toEqual(["ola@example.com"]);
    expect(mail.subject).toBe(`Your PolishUp code: ${code}`);
    expect(mail.text).toContain("valid for 10 minutes");
    expect(mail.text).toContain("If you did not ask for it, ignore this email");
    const stored = row("SELECT * FROM login_codes WHERE email = ?", "ola@example.com")!;
    expect(stored.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.code_hash).not.toContain(code);
    expect(stored.expires_at).toBe(T0 + CODE_TTL_MS);
  });

  it("answers the same for known and unknown emails", async () => {
    await signIn(h, "known@example.com");
    at(T0 + 120_000);
    const known = await start("known@example.com");
    const unknown = await start("unknown@example.com");
    expect(known.status).toBe(unknown.status);
    expect(await known.text()).toBe(await unknown.text());
  });

  it("rejects a bad email and a bad body", async () => {
    expect((await start("not-an-email")).status).toBe(400);
    expect(await (await start("x")).json()).toMatchObject({ error: "invalid_email" });
    const res = await h.call("POST", "/auth/start", { body: "{nope" });
    expect(await res.json()).toMatchObject({ error: "bad_request" });
  });

  it("is limited per IP by the binding", async () => {
    h.authLimit.mockResolvedValueOnce({ success: false });
    const res = await h.call("POST", "/auth/start", {
      body: { email: "a@b.pl" },
      headers: { "CF-Connecting-IP": "1.2.3.4" },
    });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "rate_limited", retryAfter: 60 });
    expect(h.authLimit).toHaveBeenCalledWith({ key: "1.2.3.4" });
    expect(h.sent).toHaveLength(0);
  });

  it("limits IPv6 clients by their /64", async () => {
    await h.call("POST", "/auth/start", {
      body: { email: "a@b.pl" },
      headers: { "CF-Connecting-IP": "2001:db8:aa:bb:1:2:3:4" },
    });
    expect(h.authLimit).toHaveBeenCalledWith({ key: "2001:db8:aa:bb::/64" });
  });

  it("a missing limiter binding lets requests through and is logged once", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    h.env.AUTH_IP_LIMITER = undefined as unknown as RateLimit;
    expect((await start("a@b.pl")).status).toBe(200);
    expect((await start("c@b.pl")).status).toBe(200);
    const logged = err.mock.calls.filter((c) => String(c[0]).includes("AUTH_IP_LIMITER"));
    expect(logged).toHaveLength(1);
    err.mockRestore();
  });

  it("parallel starts for one email send one code", async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => start("a@b.pl")));
    expect(results.map((r) => r.status).sort()).toEqual([200, 429, 429, 429]);
    expect(h.sent).toHaveLength(1);
    expect(row("SELECT sends_in_window, sends_today FROM login_codes")).toEqual({ sends_in_window: 1, sends_today: 1 });
  });

  it("allows one send a minute per email", async () => {
    await start("a@b.pl");
    at(T0 + 20_000);
    const res = await start("a@b.pl");
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "rate_limited", retryAfter: 40 });
    expect(res.headers.get("Retry-After")).toBe("40");
    at(T0 + 60_000);
    expect((await start("a@b.pl")).status).toBe(200);
  });

  it("allows 5 sends per 15 minutes and 10 a day per email", async () => {
    for (let i = 0; i < 5; i++) {
      at(T0 + i * 61_000);
      expect((await start("a@b.pl")).status).toBe(200);
    }
    at(T0 + 5 * 61_000);
    const sixth = await start("a@b.pl");
    expect(sixth.status).toBe(429);
    expect(((await sixth.json()) as { retryAfter: number }).retryAfter).toBe(15 * 60 - 5 * 61);
    // a new window
    for (let i = 0; i < 5; i++) {
      at(T0 + 16 * 60_000 + i * 61_000);
      expect((await start("a@b.pl")).status).toBe(200);
    }
    at(T0 + 40 * 60_000);
    const eleventh = await start("a@b.pl");
    expect(eleventh.status).toBe(429);
    expect(((await eleventh.json()) as { retryAfter: number }).retryAfter).toBe(12 * 3600 - 40 * 60);
    // the next UTC day
    at(Date.parse("2026-10-11T00:00:01Z"));
    expect((await start("a@b.pl")).status).toBe(200);
  });

  it("stops at the daily cap for new emails, and the email may ask again at once later", async () => {
    const { key, cap } = EMAIL_BUDGETS.codeNew;
    sqliteOf(h.env.DB).prepare("INSERT INTO counters (key, day, n) VALUES (?, ?, ?)").run(key, utcDay(T0), cap - 1);
    expect((await start("a@b.pl")).status).toBe(200);
    const res = await start("c@d.pl");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "email_unavailable" });
    expect(h.sent).toHaveLength(1);
    expect(row("SELECT sent_at FROM login_codes WHERE email = ?", "c@d.pl")).toEqual({ sent_at: 0 });
  });

  it("junk sign-ups cannot use up existing users' codes", async () => {
    await signIn(h, "known@b.pl");
    const { key, cap } = EMAIL_BUDGETS.codeNew;
    sqliteOf(h.env.DB).prepare("UPDATE counters SET n = ? WHERE key = ?").run(cap, key);
    at(T0 + 61_000);
    expect((await start("junk@b.pl")).status).toBe(503);
    expect((await start("known@b.pl")).status).toBe(200);
    expect(row("SELECT n FROM counters WHERE key = ?", EMAIL_BUDGETS.codeKnown.key)).toEqual({ n: 1 });
    // the known pool has its own cap
    sqliteOf(h.env.DB).prepare("UPDATE counters SET n = ? WHERE key = ?").run(EMAIL_BUDGETS.codeKnown.cap, EMAIL_BUDGETS.codeKnown.key);
    at(T0 + 122_000);
    expect((await start("known@b.pl")).status).toBe(503);
  });

  it("the three budgets add up to Resend's 100 a day", () => {
    const total = Object.values(EMAIL_BUDGETS).reduce((n, b) => n + b.cap, 0);
    expect(total).toBeLessThanOrEqual(100);
    expect(new Set(Object.values(EMAIL_BUDGETS).map((b) => b.key)).size).toBe(3);
  });

  it("returns 503 when Resend fails, and lets the learner retry at once", async () => {
    h.resend.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const res = await start("a@b.pl");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "email_unavailable" });
    expect((await start("a@b.pl")).status).toBe(200);
  });
});

describe("POST /auth/verify", () => {
  it("counts wrong codes, then expires the code after 5 attempts", async () => {
    await start("a@b.pl");
    const good = lastCode(h);
    const bad = good === "000000" ? "111111" : "000000";
    for (let left = 4; left >= 0; left--) {
      const res = await verify("a@b.pl", bad);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid_code", attemptsLeft: left });
    }
    const res = await verify("a@b.pl", good);
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ error: "code_expired" });
  });

  it("parallel wrong guesses get at most 5 comparisons", async () => {
    await start("a@b.pl");
    const good = lastCode(h);
    const bad = good === "000000" ? "111111" : "000000";
    const results = await Promise.all(Array.from({ length: 12 }, () => verify("a@b.pl", bad)));
    const bodies = (await Promise.all(results.map((r) => r.json()))) as { error: string }[];
    expect(bodies.filter((b) => b.error === "invalid_code")).toHaveLength(5);
    expect(bodies.filter((b) => b.error === "code_expired")).toHaveLength(7);
    expect(row("SELECT attempts FROM login_codes")).toEqual({ attempts: 5 });
    expect((await verify("a@b.pl", good)).status).toBe(410);
  });

  it("expires a code after 10 minutes", async () => {
    await start("a@b.pl");
    const code = lastCode(h);
    at(T0 + CODE_TTL_MS);
    expect((await verify("a@b.pl", code)).status).toBe(410);
  });

  it("410 when there is no code", async () => {
    expect((await verify("nobody@b.pl", "123456")).status).toBe(410);
  });

  it("a new send replaces the old code", async () => {
    await start("a@b.pl");
    const first = lastCode(h);
    at(T0 + 61_000);
    await start("a@b.pl");
    const second = lastCode(h);
    if (first !== second) expect((await verify("a@b.pl", first)).status).toBe(400);
    expect((await verify("a@b.pl", second)).status).toBe(200);
  });

  it("creates the account with beta while BETA_OPEN, and the code is single use", async () => {
    await start("Ola@Example.com");
    const code = lastCode(h);
    const res = await verify("ola@example.com", ` ${code.slice(0, 3)} ${code.slice(3)} `);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      isNew: boolean;
      user: { id: string; email: string; createdAt: number; marketingConsent: boolean };
      entitlement: { status: string; plan: string; access: boolean };
    };
    expect(body.isNew).toBe(true);
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.user).toMatchObject({ email: "ola@example.com", createdAt: T0, marketingConsent: false });
    expect(body.entitlement).toMatchObject({ status: "beta", plan: "beta", access: true });
    expect(row("SELECT list_dirty FROM users WHERE id = ?", body.user.id)).toEqual({ list_dirty: 1 });
    expect(syncContact).toHaveBeenCalledWith(h.env, body.user.id);
    // only the hash of the token is stored
    expect(row("SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?", body.token)).toEqual({ n: 0 });
    // reuse
    expect((await verify("ola@example.com", code)).status).toBe(410);
  });

  it("a returning user gets isNew false and a second session", async () => {
    const first = await signIn(h);
    at(T0 + 61_000);
    const second = await signIn(h);
    expect(second.isNew).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    expect(second.token).not.toBe(first.token);
    expect(row("SELECT COUNT(*) AS n FROM sessions")).toEqual({ n: 2 });
  });

  it("gives no entitlement while the beta is closed, and keeps existing beta", async () => {
    const early = await signIn(h, "early@b.pl");
    h.env.BETA_OPEN = "false";
    const late = await signIn(h, "late@b.pl");
    expect(late.entitlement).toMatchObject({ status: "none", access: false });
    expect(row("SELECT COUNT(*) AS n FROM entitlements WHERE user_id = ?", late.user.id)).toEqual({ n: 0 });
    at(T0 + 61_000);
    const again = await signIn(h, "early@b.pl");
    expect(again.user.id).toBe(early.user.id);
    expect(again.entitlement).toMatchObject({ status: "beta", access: true });
  });

  it("marketing consent: true sets it, false or missing never withdraws", async () => {
    const a = await signIn(h, "a@b.pl", true);
    expect(a.user).toMatchObject({ marketingConsent: true });
    expect(row("SELECT marketing_consent_source s, marketing_consent_at t FROM users WHERE id = ?", a.user.id)).toEqual({
      s: "signin:v1",
      t: T0,
    });
    at(T0 + 61_000);
    const again = await signIn(h, "a@b.pl", false);
    expect(again.user).toMatchObject({ marketingConsent: true });
    at(T0 + 122_000);
    expect((await signIn(h, "a@b.pl")).user).toMatchObject({ marketingConsent: true });

    // an existing user without consent gives it at a later sign-in
    const b = await signIn(h, "b@b.pl");
    expect(b.user).toMatchObject({ marketingConsent: false });
    sqliteOf(h.env.DB).prepare("UPDATE users SET list_dirty = 0 WHERE id = ?").run(b.user.id);
    vi.mocked(syncContact).mockClear();
    at(T0 + 200_000);
    const b2 = await signIn(h, "b@b.pl", true);
    expect(b2.user).toMatchObject({ marketingConsent: true });
    expect(row("SELECT list_dirty FROM users WHERE id = ?", b.user.id)).toEqual({ list_dirty: 1 });
    expect(syncContact).toHaveBeenCalledTimes(1);
  });

  it("is limited per IP by the binding", async () => {
    h.verifyLimit.mockResolvedValueOnce({ success: false });
    const res = await verify("a@b.pl", "123456");
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "rate_limited" });
  });

  it("rejects a malformed body", async () => {
    expect((await h.call("POST", "/auth/verify", { body: { email: "a@b.pl" } })).status).toBe(400);
    expect((await verify("a@b.pl", "123456", { marketingConsent: "yes" })).status).toBe(400);
  });
});

describe("sessions", () => {
  it("401 without, with a bad, or with an unknown token", async () => {
    for (const token of [undefined, "short", "x".repeat(43)]) {
      const res = await h.call("GET", "/me", { token });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
  });

  it("slides the expiry at most once a day, and expires after 180 idle days", async () => {
    const { token } = await signIn(h);
    const session = () => row("SELECT last_used_at, expires_at FROM sessions");
    at(T0 + 3_600_000);
    expect((await h.call("GET", "/me", { token })).status).toBe(200);
    expect(session()).toEqual({ last_used_at: T0, expires_at: T0 + SESSION_TTL_MS });
    const later = T0 + 2 * 86_400_000;
    at(later);
    expect((await h.call("GET", "/me", { token })).status).toBe(200);
    expect(session()).toEqual({ last_used_at: later, expires_at: later + SESSION_TTL_MS });
    at(later + SESSION_TTL_MS);
    expect((await h.call("GET", "/me", { token })).status).toBe(401);
  });

  it("signout deletes this session only", async () => {
    const a = await signIn(h);
    at(T0 + 61_000);
    const b = await signIn(h);
    expect(await (await h.call("POST", "/auth/signout", { token: a.token })).json()).toEqual({ ok: true });
    expect((await h.call("GET", "/me", { token: a.token })).status).toBe(401);
    expect((await h.call("GET", "/me", { token: b.token })).status).toBe(200);
  });
});
