import {
  type Stamped,
  SYNC_MAX_BYTES,
  SYNC_MAX_PULL,
  SYNC_MAX_PUSH,
  type WireBase,
  type WireEvent,
  type WireProfile,
  type WireSettings,
} from "./contract";
import { chunks } from "./db";
import type { Authed, Env } from "./env";
import { apiError, isRecord, rawJson, readBody } from "./http";

/**
 * POST /sync (plans/phase-4.md §6): push the outbox, pull everything after the
 * cursor, last write wins for settings and profile, first device's base.
 *
 * CPU is tight (10 ms on the free plan), so events are inserted through
 * json_each (one bound JSON array per statement, not 4 values per event) and
 * pulled rows are spliced into the response as stored JSON, never re-parsed.
 */

/** Mirrors DRILL_KINDS and CASES in lib/types.ts. A new drill needs a Worker deploy first. */
export const DRILLS = ["cases", "pronouns", "possessives", "numbers", "verbs"] as const;
export const CASES = ["nom", "gen", "dat", "acc", "ins", "loc", "voc"] as const;
export const VERDICTS = ["correct", "diacritics", "wrong"] as const;
/** lib/storage.ts PROFILE_NAME_MAX. */
export const PROFILE_NAME_MAX = 40;
/** Events per INSERT … json_each statement; all go in one D1 batch. */
const INSERT_CHUNK = 250;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
/** A settings / profile stamp further ahead than this (a wrong device clock) is pulled back to it. */
export const MAX_CLOCK_AHEAD_MS = DAY_MS;
const MISS_RE = /^[A-Za-z]{1,32}$/;

const shortString = (x: unknown, max = 200): x is string => typeof x === "string" && x.length > 0 && x.length <= max;
/** Client clock (ms). The app sends 1 for a value it never stamped, so any safe integer ≥ 0 is taken. */
const stamp = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;

/**
 * Field rules of lib/progress.ts AnswerEvent. Extra fields pass the check but
 * are dropped by `wireEvent`, so a stored event is a few hundred bytes at most.
 */
export function isWireEvent(x: unknown): x is WireEvent {
  if (!isRecord(x)) return false;
  return (
    typeof x.t === "number" &&
    Number.isSafeInteger(x.t) &&
    x.t > 0 &&
    typeof x.day === "string" &&
    DAY_RE.test(x.day) &&
    shortString(x.card) &&
    shortString(x.skill) &&
    (VERDICTS as readonly unknown[]).includes(x.verdict) &&
    (x.miss === undefined || (typeof x.miss === "string" && MISS_RE.test(x.miss))) &&
    (DRILLS as readonly unknown[]).includes(x.drill) &&
    (CASES as readonly unknown[]).includes(x.case)
  );
}

/** Only the known fields, in a fixed order. */
export function wireEvent(x: WireEvent): WireEvent {
  const { t, day, card, skill, verdict, miss, drill } = x;
  return miss === undefined
    ? { t, day, card, skill, verdict, drill, case: x.case }
    : { t, day, card, skill, verdict, miss, drill, case: x.case };
}

/** Looks like `Progress["base"]`: v 2 and the four records (lib/sync.ts decodeBase). */
export function isWireBase(x: unknown): x is WireBase {
  return (
    isRecord(x) && x.v === 2 && isRecord(x.cards) && isRecord(x.skills) && isRecord(x.days) && isRecord(x.cases)
  );
}

const isInt = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;

export function isStampedSettings(x: unknown): x is Stamped<WireSettings> {
  return (
    isRecord(x) &&
    stamp(x.updatedAt) &&
    isRecord(x.value) &&
    isInt(x.value.goal, 1, 1000) &&
    isInt(x.value.newPerDay, 0, 100)
  );
}

export function isStampedProfile(x: unknown): x is Stamped<WireProfile> {
  return (
    isRecord(x) &&
    stamp(x.updatedAt) &&
    isRecord(x.value) &&
    typeof x.value.name === "string" &&
    x.value.name.length <= PROFILE_NAME_MAX
  );
}

type Parsed = {
  cursor: number;
  events: WireEvent[];
  settings?: Stamped<WireSettings>;
  profile?: Stamped<WireProfile>;
  base?: WireBase;
};

function parse(body: unknown): Parsed | "too_large" | null {
  if (!isRecord(body)) return null;
  const { cursor, events, settings, profile, base } = body;
  if (!isInt(cursor, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (!Array.isArray(events)) return null;
  if (events.length > SYNC_MAX_PUSH) return "too_large";
  if (!events.every(isWireEvent)) return null;
  if (settings != null && !isStampedSettings(settings)) return null;
  if (profile != null && !isStampedProfile(profile)) return null;
  if (base != null && !isWireBase(base)) return null;
  return {
    cursor,
    events: events.map(wireEvent),
    settings: settings ?? undefined,
    profile: profile ?? undefined,
    base: base ?? undefined,
  };
}

type DataRow = { key: string; value: string; updated_at: number };

const stamped = <T>(row: DataRow | undefined): Stamped<T> | null =>
  row ? { value: JSON.parse(row.value) as T, updatedAt: row.updated_at } : null;

export async function sync(req: Request, env: Env, who: Authed): Promise<Response> {
  const body = await readBody<unknown>(req, SYNC_MAX_BYTES);
  if (!body.ok) return body.reason === "too_large" ? apiError(413, "too_large") : apiError(400, "bad_request");
  const parsed = parse(body.value);
  if (parsed === "too_large") return apiError(413, "too_large");
  if (!parsed) return apiError(400, "bad_request");

  const db = env.DB;
  const uid = who.userId;
  const now = Date.now();
  const latest = now + MAX_CLOCK_AHEAD_MS;
  const writes: D1PreparedStatement[] = [];

  for (const chunk of chunks(parsed.events, INSERT_CHUNK)) {
    writes.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO events (user_id, t, card, e)
           SELECT ?1, json_extract(value, '$.t'), json_extract(value, '$.card'), value
             FROM json_each(?2) ORDER BY key`,
        )
        .bind(uid, JSON.stringify(chunk)),
    );
  }
  const lww = db.prepare(
    `INSERT INTO user_data (user_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
     WHERE excluded.updated_at > user_data.updated_at`,
  );
  if (parsed.settings) {
    const { goal, newPerDay } = parsed.settings.value;
    writes.push(lww.bind(uid, "settings", JSON.stringify({ goal, newPerDay }), Math.min(parsed.settings.updatedAt, latest)));
  }
  if (parsed.profile) {
    const stampAt = Math.min(parsed.profile.updatedAt, latest);
    writes.push(lww.bind(uid, "profile", JSON.stringify({ name: parsed.profile.value.name }), stampAt));
  }
  if (parsed.base) {
    // first device wins (§7)
    writes.push(
      db.prepare("UPDATE users SET base = ? WHERE id = ? AND base IS NULL").bind(JSON.stringify(parsed.base), uid),
    );
  }
  writes.push(db.prepare("UPDATE users SET first_sync_at = ? WHERE id = ? AND first_sync_at IS NULL").bind(now, uid));

  const reads = [
    db.prepare("SELECT key, value, updated_at FROM user_data WHERE user_id = ?").bind(uid),
    db.prepare("SELECT base FROM users WHERE id = ?").bind(uid),
    db
      .prepare("SELECT seq, e FROM events WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?")
      .bind(uid, parsed.cursor, SYNC_MAX_PULL + 1),
  ];
  const results = await db.batch([...writes, ...reads]);
  const [dataRes, baseRes, eventsRes] = results.slice(writes.length);

  const data = (dataRes.results ?? []) as DataRow[];
  const baseText = ((baseRes.results ?? [])[0] as { base: string | null } | undefined)?.base ?? null;
  const rows = (eventsRes.results ?? []) as { seq: number; e: string }[];
  const more = rows.length > SYNC_MAX_PULL;
  if (more) rows.length = SYNC_MAX_PULL;
  const cursor = rows.length ? rows[rows.length - 1].seq : parsed.cursor;

  const settings = stamped<WireSettings>(data.find((r) => r.key === "settings"));
  const profile = stamped<WireProfile>(data.find((r) => r.key === "profile"));
  // events and base are spliced in as stored JSON (see the note at the top)
  const out =
    `{"cursor":${cursor},"events":[${rows.map((r) => r.e).join(",")}],"more":${more},` +
    `"settings":${JSON.stringify(settings)},"profile":${JSON.stringify(profile)},"base":${baseText ?? "null"}}`;
  return rawJson(out);
}

/** The user's whole log as a JSON array text, in seq order (for /account/export). */
export async function allEventsJson(db: D1Database, userId: string): Promise<string> {
  const { results } = await db.prepare("SELECT e FROM events WHERE user_id = ? ORDER BY seq").bind(userId).all<{ e: string }>();
  return `[${(results ?? []).map((r) => r.e).join(",")}]`;
}

export async function userData(
  db: D1Database,
  userId: string,
): Promise<{ settings: Stamped<WireSettings> | null; profile: Stamped<WireProfile> | null }> {
  const { results } = await db
    .prepare("SELECT key, value, updated_at FROM user_data WHERE user_id = ?")
    .bind(userId)
    .all<DataRow>();
  const rows = results ?? [];
  return {
    settings: stamped<WireSettings>(rows.find((r) => r.key === "settings")),
    profile: stamped<WireProfile>(rows.find((r) => r.key === "profile")),
  };
}
