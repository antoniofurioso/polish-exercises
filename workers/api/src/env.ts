/** Bindings, vars and secrets of workers/api (plans/phase-4.md §2). */
export interface Env {
  DB: D1Database;
  AUTH_IP_LIMITER: RateLimit;
  VERIFY_IP_LIMITER: RateLimit;

  ALLOWED_ORIGINS: string;
  ALLOWED_ORIGIN_SUFFIX: string;
  APP_URL: string;
  API_URL: string;
  EMAIL_FROM: string;
  /** "true" | "false" */
  BETA_OPEN: string;
  /** ISO date; empty = no Lifetime offer. */
  LIFETIME_OFFER_UNTIL: string;
  PRICE_MONTHLY: string;
  PRICE_ANNUAL: string;
  PRICE_LIFETIME: string;
  /** JSON: ListName → Resend segment id. */
  RESEND_SEGMENTS: string;

  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  RESEND_API_KEY: string;
  CODE_PEPPER: string;
  UNSUB_SECRET: string;
  /** Local dev only (.dev.vars): "true" logs emails to the console instead of sending them. */
  DEV_LOG_EMAIL?: string;
}

/** What the router hands an authenticated handler. */
export type Authed = { userId: string; email: string };

/**
 * Route handlers owned by workstream B (billing.ts, list.ts, stripe.ts,
 * entitlement.ts). The router in index.ts (workstream A) calls them; each
 * returns a full Response (JSON or HTML) and never throws for expected errors.
 */
export interface BillingRoutes {
  checkout(req: Request, env: Env, ctx: ExecutionContext, who: Authed): Promise<Response>;
  refresh(req: Request, env: Env, ctx: ExecutionContext, who: Authed): Promise<Response>;
  portal(req: Request, env: Env, ctx: ExecutionContext, who: Authed): Promise<Response>;
  webhook(req: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
  unsubscribe(req: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
}
