/**
 * The email list (plans/phase-4.md §10): every user is a Resend contact in the
 * segment of its plan, `unsubscribed` unless it gave marketing consent. D1 is
 * the source of truth; `users.list_dirty` marks contacts Resend must catch up
 * with, `users.list_synced` ("<segment>|<0/1 subscribed>") what Resend has.
 *
 * Resend API: Contacts + Segments (the current one; contacts are global, a
 * segment is joined with POST /contacts/{email}/segments/{id}). Every HTTP call
 * is in `resend` below, so moving to the older Audiences API is one object.
 */
import type { ListName } from "./contract";
import { apiError, json, readText } from "./http";
import { resendFetch } from "./email";
import type { Env } from "./env";

export const LIST_MAX_ATTEMPTS = 24;

// ---- Resend calls (isolated) ----

type Props = { user_id: string; plan: string; unsub_url: string };
const at = (email: string) => `/contacts/${encodeURIComponent(email)}`;
const send = (env: Env, path: string, method: string, body?: unknown) =>
  resendFetch(env, path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });

/** Each returns true on success (an already-done change counts as success). */
export const resend = {
  /** false with status 409/422 = the contact exists already. */
  async create(env: Env, email: string, unsubscribed: boolean, properties: Props, segmentId: string | null) {
    const r = await send(env, "/contacts", "POST", {
      email,
      unsubscribed,
      properties,
      ...(segmentId ? { segments: [{ id: segmentId }] } : {}),
    });
    return { ok: r.ok, exists: r.status === 409 || r.status === 422 };
  },
  async update(env: Env, email: string, unsubscribed: boolean, properties: Props) {
    return (await send(env, at(email), "PATCH", { unsubscribed, properties })).ok;
  },
  async addToSegment(env: Env, email: string, segmentId: string) {
    const r = await send(env, `${at(email)}/segments/${encodeURIComponent(segmentId)}`, "POST");
    return r.ok || r.status === 409;
  },
  async removeFromSegment(env: Env, email: string, segmentId: string) {
    const r = await send(env, `${at(email)}/segments/${encodeURIComponent(segmentId)}`, "DELETE");
    return r.ok || r.status === 404;
  },
  async remove(env: Env, email: string) {
    const r = await send(env, at(email), "DELETE");
    return r.ok || r.status === 404;
  },
};

// ---- Segment and state ----

type ListUser = {
  id: string;
  email: string;
  trial_used: number;
  marketing_consent: number;
  list_synced: string | null;
  list_dirty: number;
  list_attempts: number;
  status: string | null;
  plan: string | null;
  stripe_subscription_id: string | null;
  stripe_payment_intent_id: string | null;
};

async function loadUser(db: D1Database, userId: string): Promise<ListUser | null> {
  return db
    .prepare(
      `SELECT u.id, u.email, u.trial_used, u.marketing_consent, u.list_synced, u.list_dirty,
         u.list_attempts, e.status, e.plan, e.stripe_subscription_id, e.stripe_payment_intent_id
       FROM users u LEFT JOIN entitlements e ON e.user_id = u.id WHERE u.id = ?`,
    )
    .bind(userId)
    .first<ListUser>();
}

export function parseSynced(s: string | null): { segment: ListName | null; subscribed: boolean } | null {
  if (s === null) return null;
  const [seg, sub] = s.split("|");
  return { segment: (seg || null) as ListName | null, subscribed: sub === "1" };
}

/**
 * §10.1: the plan's segment while a plan runs (past_due and canceling stay in
 * it), `former` for `none` after having had a plan, and no segment for a user
 * who never had one (a post-beta sign-up that never bought).
 */
export function segmentFor(u: Pick<ListUser, "status" | "plan" | "trial_used" | "stripe_subscription_id" | "stripe_payment_intent_id" | "list_synced">): ListName | null {
  const status = u.status ?? "none";
  if (status === "beta") return "beta";
  if (status === "lifetime") return "lifetime";
  if (status === "trialing") return "trialing";
  if (status !== "none" && (u.plan === "monthly" || u.plan === "annual")) return u.plan;
  if (status !== "none" && u.plan === "lifetime") return "lifetime";
  const prev = parseSynced(u.list_synced)?.segment ?? null;
  const hadPlan =
    !!u.trial_used || !!u.stripe_subscription_id || !!u.stripe_payment_intent_id || prev !== null;
  return hadPlan ? "former" : null;
}

export const syncedKey = (segment: ListName | null, subscribed: boolean) =>
  `${segment ?? ""}|${subscribed ? 1 : 0}`;

function segmentIds(env: Env): Partial<Record<ListName, string>> {
  try {
    return JSON.parse(env.RESEND_SEGMENTS || "{}") as Partial<Record<ListName, string>>;
  } catch {
    return {};
  }
}

// ---- Unsubscribe link ----

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function unsubSignature(env: Pick<Env, "UNSUB_SECRET">, userId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.UNSUB_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId)));
}

export async function unsubUrl(env: Pick<Env, "UNSUB_SECRET" | "API_URL">, userId: string): Promise<string> {
  const s = await unsubSignature(env, userId);
  return `${env.API_URL}/email/unsubscribe?u=${encodeURIComponent(userId)}&s=${s}`;
}

function equalConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyUnsub(env: Pick<Env, "UNSUB_SECRET">, userId: string, sig: string): Promise<boolean> {
  if (!userId || !/^[0-9a-f]{64}$/.test(sig)) return false;
  return equalConstantTime(await unsubSignature(env, userId), sig);
}

// ---- Sync ----

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Brings the user's Resend contact in step with D1. Never throws. Idempotent:
 * compares with `list_synced` and skips calls that change nothing. Success
 * stores `list_synced` and clears `list_dirty` / `list_attempts`; failure only
 * bumps `list_attempts`. At most 4 Resend calls; `paceMs` waits between them.
 */
export async function syncContact(env: Env, userId: string, opts: { paceMs?: number } = {}): Promise<void> {
  try {
    const u = await loadUser(env.DB, userId);
    if (!u) return;
    const segment = segmentFor(u);
    const subscribed = !!u.marketing_consent;
    const want = syncedKey(segment, subscribed);
    if (u.list_synced === want) {
      if (u.list_dirty) {
        await env.DB.prepare("UPDATE users SET list_dirty = 0, list_attempts = 0 WHERE id = ?").bind(userId).run();
      }
      return;
    }

    const ids = segmentIds(env);
    const segId = segment ? ids[segment] : null;
    if (segment && !segId) throw new Error(`RESEND_SEGMENTS has no id for "${segment}"`);
    const props: Props = { user_id: u.id, plan: segment ?? "none", unsub_url: await unsubUrl(env, u.id) };
    const pace = async () => {
      if (opts.paceMs) await sleep(opts.paceMs);
    };

    const prev = parseSynced(u.list_synced);
    let ok = true;
    if (!prev) {
      const c = await resend.create(env, u.email, !subscribed, props, segId ?? null);
      if (!c.ok) {
        if (!c.exists) ok = false;
        else {
          // Already there (list_synced lost): update it and join the segment.
          await pace();
          ok = await resend.update(env, u.email, !subscribed, props);
          if (ok && segId) {
            await pace();
            ok = await resend.addToSegment(env, u.email, segId);
          }
        }
      }
    } else {
      ok = await resend.update(env, u.email, !subscribed, props);
      if (ok && prev.segment !== segment) {
        if (prev.segment && ids[prev.segment]) {
          await pace();
          ok = await resend.removeFromSegment(env, u.email, ids[prev.segment] as string);
        }
        if (ok && segId) {
          await pace();
          ok = await resend.addToSegment(env, u.email, segId);
        }
      }
    }
    if (!ok) throw new Error("Resend call failed");

    // Something may have changed while we talked to Resend: stay dirty then.
    const after = await loadUser(env.DB, userId);
    const still = after && syncedKey(segmentFor({ ...after, list_synced: want }), !!after.marketing_consent) !== want;
    await env.DB.prepare("UPDATE users SET list_synced = ?, list_dirty = ?, list_attempts = 0 WHERE id = ?")
      .bind(want, still ? 1 : 0, userId)
      .run();
  } catch (e) {
    try {
      const r = await env.DB.prepare(
        "UPDATE users SET list_attempts = list_attempts + 1 WHERE id = ? RETURNING list_attempts",
      )
        .bind(userId)
        .first<{ list_attempts: number }>();
      const n = r?.list_attempts ?? 0;
      console.error(
        n >= LIST_MAX_ATTEMPTS
          ? `list: giving up on user ${userId} after ${n} attempts until the next change`
          : `list: sync failed for user ${userId} (attempt ${n})`,
        e instanceof Error ? e.message : e,
      );
    } catch {
      console.error(`list: sync failed for user ${userId}`);
    }
  }
}

/** Removes the contact (account deletion). Never throws; a missing contact is fine. */
export async function removeContact(env: Env, email: string): Promise<void> {
  try {
    if (!(await resend.remove(env, email))) console.error("list: could not remove a contact; remove it by hand");
  } catch (e) {
    console.error("list: could not remove a contact; remove it by hand", e instanceof Error ? e.message : e);
  }
}

/** Users the cron retries: dirty and under the attempt cap, oldest attempts first. */
export async function dirtyUsers(db: D1Database, limit: number): Promise<string[]> {
  const r = await db
    .prepare("SELECT id FROM users WHERE list_dirty = 1 AND list_attempts < ? ORDER BY list_attempts, id LIMIT ?")
    .bind(LIST_MAX_ATTEMPTS, limit)
    .all<{ id: string }>();
  return r.results.map((x) => x.id);
}

// ---- GET / POST /email/unsubscribe ----

const PAGE = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title}</title>
<style>button{font:inherit;padding:.6em 1.2em;border-radius:8px;border:0;background:#c62828;color:#fff;cursor:pointer}body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px;color:#1f1f1f;background:#fff}
@media(prefers-color-scheme:dark){body{color:#eee;background:#161616}a{color:#ff8a80}}</style></head>
<body><h1>${title}</h1><p>${body}</p></body></html>`;

/**
 * Signed unsubscribe (§10.3). GET only shows a confirm button, because mail
 * scanners open links; the button POSTs back with `confirm=1` and gets a page.
 * POST without it is RFC 8058 one-click (`List-Unsubscribe=One-Click`) and
 * answers { ok: true }. A POST sets marketing_consent = 0 (source
 * "unsubscribe") and marks the list dirty; a repeat is a no-op.
 */
export async function unsubscribe(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const userId = url.searchParams.get("u") ?? "";
  const sig = (url.searchParams.get("s") ?? "").toLowerCase();
  if (!(await verifyUnsub(env, userId, sig))) return apiError(400, "bad_link");
  const html = (title: string, body: string) =>
    new Response(PAGE(title, body), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });

  if (req.method !== "POST") {
    const action = `${url.pathname}${url.search}`.replace(/&/g, "&amp;");
    return html(
      "Unsubscribe from PolishUp emails?",
      `You will get no more tips or news. Login codes and billing emails still arrive.</p>
<form method="post" action="${action}"><input type="hidden" name="confirm" value="1"><button type="submit">Unsubscribe</button></form><p>`,
    );
  }
  const form = await readText(req, 4096);
  const confirmed = form.ok && new URLSearchParams(form.value).get("confirm") === "1";

  const now = Date.now();
  const r = await env.DB.prepare(
    `UPDATE users SET marketing_consent = 0, marketing_consent_at = ?, marketing_consent_source = 'unsubscribe',
       list_dirty = 1, list_attempts = 0
     WHERE id = ? AND marketing_consent = 1`,
  )
    .bind(now, userId)
    .run();
  if (r.meta.changes > 0) ctx.waitUntil(syncContact(env, userId));

  if (!confirmed) return json({ ok: true });
  return html(
    "You are unsubscribed",
    `You will get no more tips or news from PolishUp. Login codes and billing emails still arrive. You can opt in again in <a href="${env.APP_URL}/settings">Settings</a>.`,
  );
}
