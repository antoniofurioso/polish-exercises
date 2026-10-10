import { runBillingCron } from "./billing";
import { utcDay } from "./db";
import type { Env } from "./env";
import { SEND_WINDOW_MS } from "./auth";

/**
 * The Cron Triggers (plans/phase-4.md §11), one per job so that each run stays
 * inside the 50-subrequest budget: hourly reminders and list retries, a daily
 * clean-up. Keep the expressions equal to `crons` in wrangler.toml.
 */

const DAY = 86_400_000;
export const STRIPE_EVENTS_KEEP_MS = 30 * DAY;
export const COUNTERS_KEEP_DAYS = 7;
export const HOURLY_CRON = "0 * * * *";
export const CLEANUP_CRON = "30 3 * * *";

export async function runCron(env: Env, now: number, cron: string = HOURLY_CRON): Promise<void> {
  try {
    if (cron === CLEANUP_CRON) await cleanUp(env.DB, now);
    else await runBillingCron(env, now);
  } catch (err) {
    console.error(`cron: ${cron} failed: ${err instanceof Error ? err.message : "unknown"}`);
  }
}

/**
 * Expired codes, sessions, old webhook ids and old counters. A login_codes row
 * also holds the per-email send limits, so it goes only once none of them can
 * apply any more (code expired, outside the 15-minute window, not today).
 */
export async function cleanUp(db: D1Database, now: number): Promise<void> {
  const today = utcDay(now);
  await db.batch([
    db
      .prepare("DELETE FROM login_codes WHERE expires_at <= ?1 AND sends_window_start <= ?2 AND sends_day <> ?3")
      .bind(now, now - SEND_WINDOW_MS, today),
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM stripe_events WHERE received_at < ?").bind(now - STRIPE_EVENTS_KEEP_MS),
    db.prepare("DELETE FROM counters WHERE day < ?").bind(utcDay(now - COUNTERS_KEEP_DAYS * DAY)),
  ]);
}
