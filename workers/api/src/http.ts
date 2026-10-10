import type { ApiError, ErrorCode } from "./contract";

/** English text for every error code (§4: `{ error, message }`). */
const MESSAGES: Record<ErrorCode, string | undefined> = {
  bad_request: "The request is not valid.",
  invalid_email: "That email address does not look right.",
  invalid_code: "That code is not right.",
  code_expired: "That code has expired. Ask for a new one.",
  rate_limited: "Too many tries. Wait a moment and try again.",
  email_unavailable: "We cannot send email right now. Try again later.",
  // §4.2: 401 is always exactly { error: "unauthorized" }
  unauthorized: undefined,
  too_large: "Too much data in one request.",
  already_subscribed: "You already have access.",
  has_lifetime_or_beta: "Your account already has Pro for good.",
  offer_ended: "This offer has ended.",
  no_customer: "There is no billing account yet.",
  stripe_error: "The payment service failed. Try again.",
  bad_signature: "Bad signature.",
  bad_link: "This link is not valid.",
  not_found: "Not found.",
  internal: undefined,
};

/** A JSON response, never cached unless `headers` says otherwise. */
export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return rawJson(JSON.stringify(body), status, headers);
}

/** Like `json`, for a body that is already serialised JSON text. */
export function rawJson(text: string, status = 200, headers?: HeadersInit): Response {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json; charset=utf-8");
  if (!h.has("Cache-Control")) h.set("Cache-Control", "no-store");
  return new Response(text, { status, headers: h });
}

/** `{ error, message, …extra }` with the given status. */
export function apiError(status: number, error: ErrorCode, extra?: Partial<ApiError>): Response {
  const message = MESSAGES[error];
  const body: ApiError = { error, ...(message ? { message } : {}), ...extra };
  const headers: Record<string, string> = {};
  if (extra?.retryAfter !== undefined) headers["Retry-After"] = String(extra.retryAfter);
  return json(body, status, headers);
}

export type BodyResult<T> = { ok: true; value: T } | { ok: false; reason: "too_large" | "bad_json" };
export type TextResult = { ok: true; value: string } | { ok: false; reason: "too_large" | "unreadable" };

/**
 * The body as UTF-8 text, read as a stream and abandoned as soon as it passes
 * `maxBytes` (a declared Content-Length over it is refused before reading).
 */
export async function readText(req: Request, maxBytes: number): Promise<TextResult> {
  const declared = Number(req.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };
  if (!req.body) return { ok: true, value: "" };
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        reader.cancel().catch(() => {});
        return { ok: false, reason: "too_large" };
      }
      parts.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.byteLength;
  }
  return { ok: true, value: new TextDecoder().decode(bytes) };
}

/** The body as JSON, telling "too large" apart from "not JSON". */
export async function readBody<T>(req: Request, maxBytes = 64 * 1024): Promise<BodyResult<T>> {
  const text = await readText(req, maxBytes);
  if (!text.ok) return { ok: false, reason: text.reason === "too_large" ? "too_large" : "bad_json" };
  try {
    return { ok: true, value: JSON.parse(text.value) as T };
  } catch {
    return { ok: false, reason: "bad_json" };
  }
}

/** The body as JSON; null when it is missing, not JSON, or over `maxBytes` (default 64 kB). */
export async function readJson<T>(req: Request, maxBytes?: number): Promise<T | null> {
  const body = await readBody<T>(req, maxBytes);
  return body.ok ? body.value : null;
}

export const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
