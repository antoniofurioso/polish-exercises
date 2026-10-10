import type { User } from "./contract";

/** Every column of `users` (migrations/0001_init.sql). */
export type UserRow = {
  id: string;
  email: string;
  created_at: number;
  stripe_customer_id: string | null;
  trial_used: number;
  first_sync_at: number | null;
  base: string | null;
  reminder_sent_at: number | null;
  marketing_consent: number;
  marketing_consent_at: number | null;
  marketing_consent_source: string | null;
  list_synced: string | null;
  list_dirty: number;
  list_attempts: number;
};

export const getUserById = (db: D1Database, id: string): Promise<UserRow | null> =>
  db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();

/** `email` must already be normalised (`normaliseEmail`). */
export const getUserByEmail = (db: D1Database, email: string): Promise<UserRow | null> =>
  db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();

export const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  createdAt: row.created_at,
  marketingConsent: row.marketing_consent === 1,
});

/** UTC calendar day of `ms`, "2026-10-10". */
export const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * A global daily cap (§4.6, e.g. code emails): adds one to `key` on `day`
 * unless it already reached `cap`, in one statement. True = allowed and counted.
 */
export async function bumpCounter(db: D1Database, key: string, day: string, cap: number): Promise<boolean> {
  if (cap <= 0) return false;
  const res = await db
    .prepare(
      `INSERT INTO counters (key, day, n) VALUES (?1, ?2, 1)
       ON CONFLICT (key, day) DO UPDATE SET n = n + 1 WHERE n < ?3`,
    )
    .bind(key, day, cap)
    .run();
  return (res.meta?.changes ?? 0) === 1;
}

/** Splits a list into chunks of `size` (D1 statements bind at most 100 values). */
export function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
