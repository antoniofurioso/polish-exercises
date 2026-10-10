import { trialKey } from "./auth";
import { deleteBillingFor } from "./billing";
import { publicConfig } from "./config";
import { type ConsentRequest, CONSENT_VERSION, type MeResponse } from "./contract";
import { getUserById, toUser } from "./db";
import { readEntitlement } from "./entitlement";
import type { Authed, Env } from "./env";
import { apiError, json, rawJson, readJson } from "./http";
import { removeContact, syncContact } from "./list";
import { allEventsJson, userData } from "./sync";

/** GET /me, POST /account/consent, GET /account/export, DELETE /account (plans/phase-4.md §4.2, §12). */

export async function me(req: Request, env: Env, who: Authed): Promise<Response> {
  const user = await getUserById(env.DB, who.userId);
  if (!user) return apiError(401, "unauthorized");
  const body: MeResponse = {
    user: toUser(user),
    entitlement: await readEntitlement(env.DB, user.id, Date.now()),
    config: publicConfig(env, req),
  };
  return json(body);
}

/** Sets or withdraws marketing consent (source `settings:v1`); the list follows (§10.2). */
export async function setConsent(req: Request, env: Env, ctx: ExecutionContext, who: Authed): Promise<Response> {
  const body = await readJson<ConsentRequest>(req);
  if (!body || typeof body.marketing !== "boolean") return apiError(400, "bad_request");
  const user = await getUserById(env.DB, who.userId);
  if (!user) return apiError(401, "unauthorized");
  const value = body.marketing ? 1 : 0;
  if (user.marketing_consent === value) return json({ user: toUser(user) });

  const now = Date.now();
  const source = `settings:${CONSENT_VERSION}`;
  await env.DB.prepare(
    `UPDATE users SET marketing_consent = ?, marketing_consent_at = ?, marketing_consent_source = ?,
       list_dirty = 1, list_attempts = 0 WHERE id = ?`,
  )
    .bind(value, now, source, user.id)
    .run();
  ctx.waitUntil(syncContact(env, user.id));
  return json({ user: toUser({ ...user, marketing_consent: value }) });
}

/** GDPR access and portability: everything the account holds that the learner made. */
export async function exportData(env: Env, who: Authed): Promise<Response> {
  const user = await getUserById(env.DB, who.userId);
  if (!user) return apiError(401, "unauthorized");
  const now = Date.now();
  const [entitlement, data, events] = await Promise.all([
    readEntitlement(env.DB, user.id, now),
    userData(env.DB, user.id),
    allEventsJson(env.DB, user.id),
  ]);
  const head = JSON.stringify({ user: toUser(user), entitlement, settings: data.settings, profile: data.profile });
  // the log is spliced in as stored JSON, like /sync
  return rawJson(`${head.slice(0, -1)},"events":${events}}`, 200, {
    "Content-Disposition": 'attachment; filename="polishup-export.json"',
  });
}

/**
 * DELETE /account (§12): Stripe first (a failure stops everything with 502),
 * then the Resend contact (never fatal), then every D1 row of the user
 * except its trial_history entry.
 */
export async function deleteAccount(env: Env, ctx: ExecutionContext, who: Authed): Promise<Response> {
  const user = await getUserById(env.DB, who.userId);
  if (!user) return apiError(401, "unauthorized");
  try {
    await deleteBillingFor(env, user.id);
  } catch (err) {
    console.error(`account: delete stopped, stripe failed: ${err instanceof Error ? err.message : "unknown"}`);
    return apiError(502, "stripe_error");
  }
  ctx.waitUntil(removeContact(env, user.email));
  const db = env.DB;
  await db.batch([
    // a used trial outlives the account (§9.2): no second trial after re-signing up
    db
      .prepare("INSERT OR IGNORE INTO trial_history (email_hash) SELECT ?1 FROM users WHERE id = ?2 AND trial_used = 1")
      .bind(await trialKey(env, user.email), user.id),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    db.prepare("DELETE FROM events WHERE user_id = ?").bind(user.id),
    db.prepare("DELETE FROM user_data WHERE user_id = ?").bind(user.id),
    db.prepare("DELETE FROM entitlements WHERE user_id = ?").bind(user.id),
    db.prepare("DELETE FROM login_codes WHERE email = ?").bind(user.email),
    db.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  return json({ ok: true });
}
