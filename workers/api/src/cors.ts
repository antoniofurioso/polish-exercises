import type { Env } from "./env";

/**
 * CORS (plans/phase-4.md §2): exact origins from ALLOWED_ORIGINS, plus any
 * https origin whose host ends with ALLOWED_ORIGIN_SUFFIX (Pages previews).
 * /billing/webhook and /email/unsubscribe skip this entirely.
 */
export function allowedOrigin(origin: string | null, env: Env): boolean {
  if (!origin) return false;
  const exact = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (exact.includes(origin)) return true;
  const suffix = (env.ALLOWED_ORIGIN_SUFFIX ?? "").trim();
  if (!suffix) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const dotted = suffix.startsWith(".") ? suffix : `.${suffix}`;
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    url.origin === origin &&
    url.hostname.endsWith(dotted) &&
    url.hostname.length > dotted.length
  );
}

export function corsHeaders(origin: string): Record<string, string> {
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
}

/** The answer to an allowed preflight. */
export function preflight(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/** Adds the CORS headers to a response from a handler. */
export function withCors(res: Response, origin: string | null): Response {
  const out = new Response(res.body, res);
  if (origin) for (const [k, v] of Object.entries(corsHeaders(origin))) out.headers.set(k, v);
  else out.headers.append("Vary", "Origin");
  return out;
}
