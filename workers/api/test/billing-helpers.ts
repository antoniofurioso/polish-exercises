/** Shared fixtures for the billing and list tests (workstream B). */
import { createTestDb } from "./d1";
import type { Env } from "../src/env";

export const SEGMENTS = {
  beta: "seg_beta",
  trialing: "seg_trialing",
  monthly: "seg_monthly",
  annual: "seg_annual",
  lifetime: "seg_lifetime",
  former: "seg_former",
};

export async function makeEnv(over: Partial<Env> = {}): Promise<Env> {
  const DB = await createTestDb();
  const limiter = { limit: async () => ({ success: true }) } as unknown as RateLimit;
  return {
    DB,
    AUTH_IP_LIMITER: limiter,
    VERIFY_IP_LIMITER: limiter,
    ALLOWED_ORIGINS: "https://polishup.app",
    ALLOWED_ORIGIN_SUFFIX: ".polish-exercises.pages.dev",
    APP_URL: "https://polishup.app",
    API_URL: "https://api.polishup.app",
    EMAIL_FROM: "PolishUp <hello@mail.polishup.app>",
    BETA_OPEN: "false",
    LIFETIME_OFFER_UNTIL: "2099-01-01",
    PRICE_MONTHLY: "price_monthly",
    PRICE_ANNUAL: "price_annual",
    PRICE_LIFETIME: "price_lifetime",
    RESEND_SEGMENTS: JSON.stringify(SEGMENTS),
    STRIPE_SECRET_KEY: "sk_test_x",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    RESEND_API_KEY: "re_test",
    CODE_PEPPER: "pepper",
    UNSUB_SECRET: "unsub-secret",
    ...over,
  };
}

export function makeCtx(): ExecutionContext & { settle(): Promise<void> } {
  const waits: Promise<unknown>[] = [];
  return {
    waitUntil: (p: Promise<unknown>) => void waits.push(p),
    passThroughOnException: () => {},
    props: {},
    settle: async () => {
      while (waits.length) await waits.shift();
    },
  } as unknown as ExecutionContext & { settle(): Promise<void> };
}

export type UserSeed = {
  id?: string;
  email?: string;
  stripe_customer_id?: string | null;
  trial_used?: number;
  marketing_consent?: number;
  list_synced?: string | null;
  list_dirty?: number;
  list_attempts?: number;
};

export async function addUser(env: Env, u: UserSeed = {}): Promise<string> {
  const id = u.id ?? crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (id, email, created_at, stripe_customer_id, trial_used, marketing_consent,
       list_synced, list_dirty, list_attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      u.email ?? `${id}@example.com`,
      1,
      u.stripe_customer_id ?? null,
      u.trial_used ?? 0,
      u.marketing_consent ?? 0,
      u.list_synced ?? null,
      u.list_dirty ?? 0,
      u.list_attempts ?? 0,
    )
    .run();
  return id;
}

export async function setEntitlement(
  env: Env,
  userId: string,
  e: { status: string; plan?: string | null; until?: number | null; trial_end?: number | null; currency?: string | null; pi?: string | null; sub?: string | null },
): Promise<void> {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO entitlements (user_id, plan, status, until, trial_end, stripe_subscription_id,
       stripe_payment_intent_id, currency, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  )
    .bind(userId, e.plan ?? null, e.status, e.until ?? null, e.trial_end ?? null, e.sub ?? null, e.pi ?? null, e.currency ?? null)
    .run();
}

export async function userRow(env: Env, id: string) {
  return env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<Record<string, unknown>>();
}

export async function entRow(env: Env, id: string) {
  return env.DB.prepare("SELECT * FROM entitlements WHERE user_id = ?").bind(id).first<Record<string, unknown>>();
}

export const authed = (userId: string) => ({ userId, email: `${userId}@example.com` });

export const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://api.polishup.app${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
