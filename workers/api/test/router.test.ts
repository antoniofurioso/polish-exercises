import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { billingRoutes } from "../src/billing";
import { currencyFor, lifetimeOfferUntil } from "../src/config";
import { allowedOrigin } from "../src/cors";
import type { Env } from "../src/env";
import { type Harness, harness, signIn } from "./helpers";

vi.mock("../src/list", () => ({ syncContact: vi.fn(async () => {}), removeContact: vi.fn(async () => {}) }));
vi.mock("../src/billing", () => {
  const ok = (name: string) => vi.fn(async () => new Response(JSON.stringify({ route: name })));
  return {
    billingRoutes: {
      checkout: ok("checkout"),
      refresh: ok("refresh"),
      portal: ok("portal"),
      webhook: ok("webhook"),
      unsubscribe: ok("unsubscribe"),
    },
    deleteBillingFor: vi.fn(async () => {}),
    runBillingCron: vi.fn(async () => {}),
  };
});

let h: Harness;
beforeEach(() => {
  vi.clearAllMocks();
  h = harness();
});
afterEach(() => vi.unstubAllGlobals());

describe("CORS", () => {
  const env = { ALLOWED_ORIGINS: "https://polishup.app, http://localhost:3000/", ALLOWED_ORIGIN_SUFFIX: ".polish-exercises.pages.dev" } as Env;
  it.each([
    ["https://polishup.app", true],
    ["http://localhost:3000", true],
    ["https://abc123.polish-exercises.pages.dev", true],
    ["https://polish-exercises.pages.dev", false],
    ["http://abc.polish-exercises.pages.dev", false],
    ["https://evil-polish-exercises.pages.dev", false],
    ["https://abc.polish-exercises.pages.dev.evil.com", false],
    ["https://abc.polish-exercises.pages.dev:8443", false],
    ["https://evil.com", false],
    ["null", false],
  ])("%s → %s", (origin, ok) => {
    expect(allowedOrigin(origin, env)).toBe(ok);
  });

  it("answers an allowed preflight", async () => {
    const res = await h.call("OPTIONS", "/sync");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://polishup.app");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, DELETE, OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization");
    expect(res.headers.get("Access-Control-Max-Age")).toBe("86400");
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("adds the headers for an allowed origin, including a preview", async () => {
    const res = await h.call("GET", "/health", { origin: "https://feat-x.polish-exercises.pages.dev" });
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://feat-x.polish-exercises.pages.dev");
  });

  it("refuses a foreign origin before doing anything", async () => {
    const res = await h.call("POST", "/auth/start", { origin: "https://evil.com", body: { email: "a@b.pl" } });
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(h.sent).toHaveLength(0);
    expect((await h.call("OPTIONS", "/sync", { origin: "https://evil.com" })).status).toBe(403);
  });

  it("serves calls without Origin, without CORS headers", async () => {
    const res = await h.call("GET", "/health", { origin: null });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("webhook and unsubscribe skip CORS and the Origin check", async () => {
    const hook = await h.call("POST", "/billing/webhook", { origin: "https://evil.com", body: "{}" });
    expect(await hook.json()).toEqual({ route: "webhook" });
    expect(hook.headers.get("Access-Control-Allow-Origin")).toBeNull();
    for (const method of ["GET", "POST"]) {
      const res = await h.call(method, "/email/unsubscribe?u=1&s=2", { origin: null });
      expect(await res.json()).toEqual({ route: "unsubscribe" });
    }
  });
});

describe("routing", () => {
  it("404 for unknown paths and methods", async () => {
    expect(await (await h.call("GET", "/nope")).json()).toMatchObject({ error: "not_found" });
    expect((await h.call("DELETE", "/sync")).status).toBe(404);
  });

  it("billing routes need a session and get the Authed user", async () => {
    expect((await h.call("POST", "/billing/checkout", { body: {} })).status).toBe(401);
    expect(billingRoutes.checkout).not.toHaveBeenCalled();
    const { token, user } = await signIn(h);
    for (const route of ["checkout", "refresh", "portal"] as const) {
      const res = await h.call("POST", `/billing/${route}`, { token, body: {} });
      expect(await res.json()).toEqual({ route });
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://polishup.app");
      expect(vi.mocked(billingRoutes[route]).mock.calls[0][3]).toEqual({ userId: user.id, email: "ola@example.com" });
    }
  });

  it("500 internal without details on an unexpected error", async () => {
    vi.mocked(billingRoutes.webhook).mockRejectedValueOnce(new Error("secret detail"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await h.call("POST", "/billing/webhook", { body: "{}" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
  });
});

describe("GET /config", () => {
  it("is cached 5 minutes and picks the currency by country", async () => {
    const res = await h.call("GET", "/config", { cf: { country: "DE" } });
    expect(res.headers.get("Cache-Control")).toContain("max-age=300");
    expect(await res.json()).toEqual({ betaOpen: true, lifetimeOfferUntil: null, currency: "eur" });
  });

  it("reads the switches", async () => {
    h.env.BETA_OPEN = "false";
    h.env.LIFETIME_OFFER_UNTIL = "2026-12-31";
    const body = await (await h.call("GET", "/config")).json();
    expect(body).toEqual({ betaOpen: false, lifetimeOfferUntil: Date.parse("2026-12-31"), currency: "usd" });
  });

  it("maps countries and dates", () => {
    expect(currencyFor("PL")).toBe("pln");
    expect(currencyFor("fr")).toBe("eur");
    expect(currencyFor("US")).toBe("usd");
    expect(currencyFor(undefined)).toBe("usd");
    expect(lifetimeOfferUntil({ LIFETIME_OFFER_UNTIL: "" } as Env)).toBeNull();
    expect(lifetimeOfferUntil({ LIFETIME_OFFER_UNTIL: "soon" } as Env)).toBeNull();
  });
});
