/** Shared fixtures for the core tests (workstream A): env, ctx, requests, sign-in. */
import { vi } from "vitest";
import type { Env } from "../src/env";
import { handle } from "../src/index";
import { createTestDb } from "./d1";

export const ORIGIN = "https://polishup.app";
export const API = "https://api.polishup.app";

export type Harness = {
  env: Env;
  /** Every email body sent through Resend, newest last. */
  sent: { to: string[]; subject: string; text: string; headers?: Record<string, string> }[];
  resend: ReturnType<typeof vi.fn>;
  authLimit: ReturnType<typeof vi.fn>;
  verifyLimit: ReturnType<typeof vi.fn>;
  call(method: string, path: string, opts?: CallOpts): Promise<Response>;
};

export type CallOpts = {
  body?: unknown;
  token?: string;
  origin?: string | null;
  headers?: Record<string, string>;
  cf?: { country?: string };
};

export function makeCtx(pending: Promise<unknown>[]): ExecutionContext {
  return {
    waitUntil: (p: Promise<unknown>) => void pending.push(p),
    passThroughOnException() {},
    props: {},
  } as unknown as ExecutionContext;
}

export function harness(over: Partial<Env> = {}): Harness {
  const sent: Harness["sent"] = [];
  const resend = vi.fn(async (url: string, init: RequestInit) => {
    if (String(url).endsWith("/emails")) sent.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ id: `em_${sent.length}` }), { status: 200 });
  });
  vi.stubGlobal("fetch", resend);
  const authLimit = vi.fn(async () => ({ success: true }));
  const verifyLimit = vi.fn(async () => ({ success: true }));
  const env: Env = {
    DB: createTestDb(),
    AUTH_IP_LIMITER: { limit: authLimit } as unknown as RateLimit,
    VERIFY_IP_LIMITER: { limit: verifyLimit } as unknown as RateLimit,
    ALLOWED_ORIGINS: `${ORIGIN},http://localhost:3000`,
    ALLOWED_ORIGIN_SUFFIX: ".polish-exercises.pages.dev",
    APP_URL: ORIGIN,
    API_URL: API,
    EMAIL_FROM: "PolishUp <hello@mail.polishup.app>",
    BETA_OPEN: "true",
    LIFETIME_OFFER_UNTIL: "",
    PRICE_MONTHLY: "price_m",
    PRICE_ANNUAL: "price_a",
    PRICE_LIFETIME: "price_l",
    RESEND_SEGMENTS: "{}",
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_WEBHOOK_SECRET: "whsec",
    RESEND_API_KEY: "re_test",
    CODE_PEPPER: "pepper",
    UNSUB_SECRET: "unsub",
    ...over,
  };
  const h: Harness = {
    env,
    sent,
    resend,
    authLimit,
    verifyLimit,
    async call(method, path, opts = {}) {
      const headers: Record<string, string> = { ...opts.headers };
      const origin = opts.origin === undefined ? ORIGIN : opts.origin;
      if (origin) headers.Origin = origin;
      if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
      if (opts.body !== undefined) headers["Content-Type"] = "application/json";
      const req = new Request(`${API}${path}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
      });
      if (opts.cf) Object.defineProperty(req, "cf", { value: opts.cf });
      const pending: Promise<unknown>[] = [];
      const res = await handle(req, h.env, makeCtx(pending));
      await Promise.all(pending);
      return res;
    },
  };
  return h;
}

/** The code in the last email sent. */
export function lastCode(h: Harness): string {
  const mail = h.sent[h.sent.length - 1];
  const m = /\b(\d{6})\b/.exec(mail.subject);
  if (!m) throw new Error("no code in the last email");
  return m[1];
}

/** Full sign-in; returns the token and the verify response. */
export async function signIn(h: Harness, email = "ola@example.com", marketingConsent?: boolean) {
  const start = await h.call("POST", "/auth/start", { body: { email } });
  if (start.status !== 200) throw new Error(`start ${start.status}`);
  const res = await h.call("POST", "/auth/verify", {
    body: { email, code: lastCode(h), ...(marketingConsent === undefined ? {} : { marketingConsent }) },
  });
  if (res.status !== 200) throw new Error(`verify ${res.status}`);
  const body = (await res.json()) as { token: string; isNew: boolean; user: { id: string }; entitlement: unknown };
  return body;
}
