import { betaOpen } from "./config";
import {
  type AuthStartRequest,
  type AuthVerifyRequest,
  type AuthVerifyResponse,
  CODE_MAX_ATTEMPTS,
  CODE_TTL_MS,
  CONSENT_VERSION,
  SESSION_TTL_MS,
} from "./contract";
import { type UserRow, bumpCounter, getUserByEmail, toUser, utcDay } from "./db";
import { EMAIL_BUDGETS, loginCodeEmail, sendEmail } from "./email";
import { readEntitlement } from "./entitlement";
import type { Authed, Env } from "./env";
import { apiError, isRecord, json, readJson } from "./http";
import { syncContact } from "./list";

/** Sign-in with a 6-digit email code, and sessions (plans/phase-4.md §4.3–4.6). */

const MINUTE = 60_000;
const DAY = 86_400_000;
/** Per-email send limits (§4.6). */
export const SEND_GAP_MS = MINUTE;
export const SEND_WINDOW_MS = 15 * MINUTE;
export const SENDS_PER_WINDOW = 5;
export const SENDS_PER_DAY = 10;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower-cased and trimmed; null when it is not a plausible address. */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  let out = "";
  for (const b of digest) out += HEX[b];
  return out;
}

/** Compares two strings without an early exit on the first difference. */
export function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Six digits from crypto.getRandomValues, zero-padded, without modulo bias. */
export function newCode(): string {
  const buf = new Uint32Array(1);
  const limit = 4_294_000_000; // largest multiple of 10^6 below 2^32
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

/** 32 random bytes, base64url. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const codeHash = (env: Env, email: string, code: string) => sha256Hex(`${env.CODE_PEPPER}${email}${code}`);

/**
 * trial_history key of a normalised email: kept after account deletion, so a
 * trial is offered once per address. "trial:" keeps it apart from code hashes.
 */
export const trialKey = (env: Pick<Env, "CODE_PEPPER">, email: string) => sha256Hex(`${env.CODE_PEPPER}trial:${email}`);

/**
 * The key the per-IP limiters count on: an IPv4 address as it is, an IPv6
 * address by its /64 prefix (one subscriber usually holds a whole /64).
 */
export function ipKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  const [head, tail] = ip.toLowerCase().split("::", 2);
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  // an embedded IPv4 tail ("::1.2.3.4") counts as two groups
  const width = (g: string[]) => g.reduce((n, x) => n + (x.includes(".") ? 2 : 1), 0);
  const groups = tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - width(left) - width(right))).fill("0"), ...right];
  const prefix = groups.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16));
  while (prefix.length < 4) prefix.push("0");
  return `${prefix.join(":")}::/64`;
}

const clientIp = (req: Request) => ipKey(req.headers.get("CF-Connecting-IP") ?? "unknown");

const warnedMissing = new Set<string>();

/** A missing binding lets the request through (fail open) but is logged once per isolate. */
async function ipLimited(limiter: RateLimit | undefined, name: string, req: Request): Promise<boolean> {
  if (!limiter) {
    if (!warnedMissing.has(name)) {
      warnedMissing.add(name);
      console.error(`auth: rate limit binding ${name} is missing; requests are not limited per IP`);
    }
    return false;
  }
  const { success } = await limiter.limit({ key: clientIp(req) });
  return !success;
}

const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

type CodeRow = {
  email: string;
  code_hash: string;
  expires_at: number;
  attempts: number;
  sent_at: number;
  sends_window_start: number;
  sends_in_window: number;
  sends_today: number;
  sends_day: string;
};

/** How long until `row` may be sent another code (seconds), or 0 when it may now. */
function retryAfter(row: CodeRow, now: number, day: string): number {
  if (now - row.sent_at < SEND_GAP_MS) return seconds(row.sent_at + SEND_GAP_MS - now);
  if (now - row.sends_window_start < SEND_WINDOW_MS && row.sends_in_window >= SENDS_PER_WINDOW) {
    return seconds(row.sends_window_start + SEND_WINDOW_MS - now);
  }
  if (row.sends_day === day && row.sends_today >= SENDS_PER_DAY) return seconds(Date.parse(day) + DAY - now);
  return 0;
}

/**
 * POST /auth/start: same answer for known and unknown emails (no account
 * enumeration). The per-email limits are checked and the new code stored in
 * one conditional upsert, so parallel requests for one email send one code.
 */
export async function authStart(req: Request, env: Env): Promise<Response> {
  if (await ipLimited(env.AUTH_IP_LIMITER, "AUTH_IP_LIMITER", req)) {
    return apiError(429, "rate_limited", { retryAfter: 60 });
  }
  const body = await readJson<AuthStartRequest>(req);
  if (!isRecord(body)) return apiError(400, "bad_request");
  const email = normaliseEmail(body.email);
  if (!email) return apiError(400, "invalid_email");

  const now = Date.now();
  const day = utcDay(now);
  const code = newCode();
  // a new send replaces the old code; the window and day counts carry over
  const claimed = await env.DB.prepare(
    `INSERT INTO login_codes
       (email, code_hash, expires_at, attempts, sent_at, sends_window_start, sends_in_window, sends_today, sends_day)
     VALUES (?1, ?2, ?3, 0, ?4, ?4, 1, 1, ?5)
     ON CONFLICT (email) DO UPDATE SET
       code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at,
       sends_window_start = CASE WHEN ?4 - sends_window_start < ?6 THEN sends_window_start ELSE ?4 END,
       sends_in_window = CASE WHEN ?4 - sends_window_start < ?6 THEN sends_in_window + 1 ELSE 1 END,
       sends_today = CASE WHEN sends_day = ?5 THEN sends_today + 1 ELSE 1 END,
       sends_day = ?5
     WHERE ?4 - login_codes.sent_at >= ?7
       AND NOT (?4 - login_codes.sends_window_start < ?6 AND login_codes.sends_in_window >= ?8)
       AND NOT (login_codes.sends_day = ?5 AND login_codes.sends_today >= ?9)
     RETURNING email`,
  )
    .bind(email, await codeHash(env, email, code), now + CODE_TTL_MS, now, day, SEND_WINDOW_MS, SEND_GAP_MS, SENDS_PER_WINDOW, SENDS_PER_DAY)
    .first<{ email: string }>();
  if (!claimed) {
    const row = await env.DB.prepare("SELECT * FROM login_codes WHERE email = ?").bind(email).first<CodeRow>();
    return apiError(429, "rate_limited", { retryAfter: row ? Math.max(1, retryAfter(row, now, day)) : 60 });
  }

  // let the learner ask again at once when nothing was sent; the window and day counts stay
  const unsent = () => env.DB.prepare("UPDATE login_codes SET sent_at = 0 WHERE email = ?").bind(email).run();
  const budget = (await getUserByEmail(env.DB, email)) ? EMAIL_BUDGETS.codeKnown : EMAIL_BUDGETS.codeNew;
  if (!(await bumpCounter(env.DB, budget.key, day, budget.cap))) {
    await unsent();
    return apiError(503, "email_unavailable");
  }
  const sent = await sendEmail(env, loginCodeEmail(email, code));
  if (!sent.ok) {
    await unsent();
    return apiError(503, "email_unavailable");
  }
  return json({ ok: true });
}

/** POST /auth/verify. A new account gets `beta` in the same batch while BETA_OPEN (§4.3, §8). */
export async function authVerify(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (await ipLimited(env.VERIFY_IP_LIMITER, "VERIFY_IP_LIMITER", req)) {
    return apiError(429, "rate_limited", { retryAfter: 60 });
  }
  const body = await readJson<AuthVerifyRequest>(req);
  if (!isRecord(body) || typeof body.code !== "string") return apiError(400, "bad_request");
  if (body.marketingConsent !== undefined && typeof body.marketingConsent !== "boolean") {
    return apiError(400, "bad_request");
  }
  const email = normaliseEmail(body.email);
  if (!email) return apiError(400, "invalid_email");
  const code = body.code.replace(/\s+/g, "");

  const now = Date.now();
  const db = env.DB;
  const hash = await codeHash(env, email, code);
  // claim one attempt before comparing, so parallel guesses can never exceed the limit
  const claim = await db
    .prepare(
      `UPDATE login_codes SET attempts = attempts + 1
       WHERE email = ?1 AND attempts < ?3 AND expires_at > ?2 AND code_hash <> ''
       RETURNING code_hash, attempts`,
    )
    .bind(email, now, CODE_MAX_ATTEMPTS)
    .first<{ code_hash: string; attempts: number }>();
  if (!claim) return apiError(410, "code_expired");
  if (!timingSafeEqual(hash, claim.code_hash)) {
    return apiError(400, "invalid_code", { attemptsLeft: Math.max(0, CODE_MAX_ATTEMPTS - claim.attempts) });
  }

  // single use: consume the code (the row stays for the per-email send limits)
  const consumed = await db
    .prepare("UPDATE login_codes SET code_hash = '', expires_at = 0 WHERE email = ? AND code_hash = ?")
    .bind(email, claim.code_hash)
    .run();
  if ((consumed.meta?.changes ?? 0) !== 1) return apiError(410, "code_expired");

  const consent = body.marketingConsent === true;
  const source = `signin:${CONSENT_VERSION}`;
  const existing = await getUserByEmail(db, email);
  const token = newToken();
  const session = db
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    );
  let user: UserRow;
  let listChanged = false;

  if (existing) {
    user = existing;
    const statements = [session.bind(await sha256Hex(token), user.id, now, now, now + SESSION_TTL_MS)];
    // false or missing never withdraws (§4.2)
    if (consent && user.marketing_consent !== 1) {
      statements.push(
        db
          .prepare(
            `UPDATE users SET marketing_consent = 1, marketing_consent_at = ?, marketing_consent_source = ?,
               list_dirty = 1, list_attempts = 0 WHERE id = ?`,
          )
          .bind(now, source, user.id),
      );
      user = { ...user, marketing_consent: 1, marketing_consent_at: now, marketing_consent_source: source, list_dirty: 1 };
      listChanged = true;
    }
    await db.batch(statements);
  } else {
    const id = crypto.randomUUID();
    user = {
      id,
      email,
      created_at: now,
      stripe_customer_id: null,
      trial_used: 0,
      first_sync_at: null,
      base: null,
      reminder_sent_at: null,
      marketing_consent: consent ? 1 : 0,
      marketing_consent_at: consent ? now : null,
      marketing_consent_source: consent ? source : null,
      list_synced: null,
      list_dirty: 1,
      list_attempts: 0,
    };
    const statements = [
      db
        .prepare(
          `INSERT INTO users (id, email, created_at, marketing_consent, marketing_consent_at,
             marketing_consent_source, list_dirty) VALUES (?, ?, ?, ?, ?, ?, 1)`,
        )
        .bind(id, email, now, user.marketing_consent, user.marketing_consent_at, user.marketing_consent_source),
    ];
    // the only place `beta` is granted
    if (betaOpen(env)) {
      statements.push(
        db
          .prepare(
            "INSERT INTO entitlements (user_id, plan, status, until, trial_end, updated_at) VALUES (?, 'beta', 'beta', NULL, NULL, ?)",
          )
          .bind(id, now),
      );
    }
    statements.push(session.bind(await sha256Hex(token), id, now, now, now + SESSION_TTL_MS));
    await db.batch(statements);
    listChanged = true;
  }

  if (listChanged) ctx.waitUntil(syncContact(env, user.id));
  const response: AuthVerifyResponse = {
    token,
    user: toUser(user),
    isNew: !existing,
    entitlement: await readEntitlement(db, user.id, now),
  };
  return json(response);
}

export type Session = { who: Authed; tokenHash: string };

/** The Bearer token's session, sliding its expiry at most once a day; null → 401. */
export async function authenticate(req: Request, env: Env, ctx: ExecutionContext): Promise<Session | null> {
  const match = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(req.headers.get("Authorization") ?? "");
  if (!match) return null;
  const tokenHash = await sha256Hex(match[1]);
  const row = await env.DB.prepare(
    `SELECT s.user_id, s.last_used_at, s.expires_at, u.email
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{ user_id: string; last_used_at: number; expires_at: number; email: string }>();
  const now = Date.now();
  if (!row || row.expires_at <= now) return null;
  if (now - row.last_used_at >= DAY) {
    ctx.waitUntil(
      env.DB.prepare("UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?")
        .bind(now, now + SESSION_TTL_MS, tokenHash)
        .run()
        .catch(() => console.error("session: slide failed")),
    );
  }
  return { who: { userId: row.user_id, email: row.email }, tokenHash };
}

/** POST /auth/signout: deletes this session only. */
export async function signOut(env: Env, session: Session): Promise<Response> {
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(session.tokenHash).run();
  return json({ ok: true });
}
