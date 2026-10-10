import { deleteAccount, exportData, me, setConsent } from "./account";
import { type Session, authStart, authVerify, authenticate, signOut } from "./auth";
import { billingRoutes } from "./billing";
import { CONFIG_CACHE, publicConfig } from "./config";
import { allowedOrigin, preflight, withCors } from "./cors";
import { runCron } from "./cron";
import type { Env } from "./env";
import { apiError, json } from "./http";
import { sync } from "./sync";

export type { Env } from "./env";

/**
 * PolishUp API (plans/phase-4.md). Routes of §4.2; CORS per §2, except for
 * the Stripe webhook and the unsubscribe link, which browsers never call
 * cross-origin and which have no Origin check.
 */

type Handler = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
type AuthedHandler = (req: Request, env: Env, ctx: ExecutionContext, session: Session) => Promise<Response>;

/** No CORS, no Origin check, no session. */
const OPEN: Record<string, Handler> = {
  "POST /billing/webhook": (req, env, ctx) => billingRoutes.webhook(req, env, ctx),
  "GET /email/unsubscribe": (req, env, ctx) => billingRoutes.unsubscribe(req, env, ctx),
  "POST /email/unsubscribe": (req, env, ctx) => billingRoutes.unsubscribe(req, env, ctx),
};

/** CORS, no session. */
const PUBLIC: Record<string, Handler> = {
  "GET /health": async () => json({ ok: true }),
  "GET /config": async (req, env) => json(publicConfig(env, req), 200, { "Cache-Control": CONFIG_CACHE }),
  "POST /auth/start": (req, env) => authStart(req, env),
  "POST /auth/verify": (req, env, ctx) => authVerify(req, env, ctx),
};

/** CORS and a valid Bearer session. */
const AUTHED: Record<string, AuthedHandler> = {
  "POST /auth/signout": (_req, env, _ctx, s) => signOut(env, s),
  "GET /me": (req, env, _ctx, s) => me(req, env, s.who),
  "POST /sync": (req, env, _ctx, s) => sync(req, env, s.who),
  "POST /account/consent": (req, env, ctx, s) => setConsent(req, env, ctx, s.who),
  "GET /account/export": (_req, env, _ctx, s) => exportData(env, s.who),
  "DELETE /account": (_req, env, ctx, s) => deleteAccount(env, ctx, s.who),
  "POST /billing/checkout": (req, env, ctx, s) => billingRoutes.checkout(req, env, ctx, s.who),
  "POST /billing/refresh": (req, env, ctx, s) => billingRoutes.refresh(req, env, ctx, s.who),
  "POST /billing/portal": (req, env, ctx, s) => billingRoutes.portal(req, env, ctx, s.who),
};

const KNOWN_PATHS = new Set(
  [...Object.keys(OPEN), ...Object.keys(PUBLIC), ...Object.keys(AUTHED)].map((k) => k.split(" ")[1]),
);

async function guarded(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    // no stack traces in responses (§4.2)
    console.error(`api: unhandled: ${err instanceof Error ? err.message : "unknown"}`);
    return apiError(500, "internal");
  }
}

export async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  const key = `${request.method} ${path}`;

  const open = OPEN[key];
  if (open) return guarded(() => open(request, env, ctx));

  const originHeader = request.headers.get("Origin");
  const origin = originHeader && allowedOrigin(originHeader, env) ? originHeader : null;
  // a browser call from a foreign origin is refused before it does anything;
  // calls without Origin (curl, server to server) go through, without CORS
  if (originHeader && !origin) return withCors(apiError(403, "bad_request", { message: "Origin not allowed." }), null);
  if (request.method === "OPTIONS") {
    if (origin && KNOWN_PATHS.has(path)) return preflight(origin);
    return withCors(apiError(404, "not_found"), origin);
  }

  const pub = PUBLIC[key];
  if (pub) return withCors(await guarded(() => pub(request, env, ctx)), origin);

  const authed = AUTHED[key];
  if (authed) {
    return withCors(
      await guarded(async () => {
        const session = await authenticate(request, env, ctx);
        if (!session) return apiError(401, "unauthorized");
        return authed(request, env, ctx, session);
      }),
      origin,
    );
  }
  return withCors(apiError(404, "not_found"), origin);
}

export default {
  fetch: handle,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCron(env, controller.scheduledTime || Date.now(), controller.cron));
  },
} satisfies ExportedHandler<Env>;
