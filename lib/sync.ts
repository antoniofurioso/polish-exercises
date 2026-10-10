"use client";

import type { Stamped, SyncRequest, SyncResponse, WireBase, WireEvent } from "../workers/api/src/contract";
import { ApiFailure, apiEnabled, fetchMe, request } from "./account";
import { replay, type AnswerEvent, type Progress, type Settings } from "./progress";
import {
  adoptProfile,
  adoptSettings,
  eventKey,
  hasStoredProfile,
  hasStoredSettings,
  readLoadedProgress,
  readLogEvents,
  readOutbox,
  readProfile,
  readSettings,
  readStoredAccount,
  readSyncState,
  writeLogAndProgress,
  writeOutbox,
  writeSyncState,
  type Profile,
  type SyncState,
} from "./storage";

/**
 * Sync with workers/api (plans/phase-4.md §6, §7). The answer log is merged by
 * the event key `(t, card)` and the cache is always rebuilt with a full
 * `replay`, so the same events in any order give the same progress. Settings
 * and the profile name are last-write-wins by `updatedAt`.
 *
 * Practice never waits on sync: every entry point is best-effort, and a throw
 * in the progress logic leaves the stored log and cache as they were.
 */

export type SyncResult = "ok" | "skipped" | "offline" | "error";

/** At most one sync per this many ms, unless forced (§6.4). */
export const SYNC_THROTTLE_MS = 30_000;
/** Same values as the contract's constants (imported for types only). */
export const SYNC_MAX_PUSH = 500;
/** A keepalive request body must stay under 64 KB; leave room for the envelope. */
export const KEEPALIVE_MAX_BYTES = 60_000;
/** A server that keeps saying `more` is cut off after this many rounds; the next sync goes on. */
const MAX_ROUNDS = 50;

const byKey = (a: AnswerEvent, b: AnswerEvent) => a.t - b.t || (a.card < b.card ? -1 : a.card > b.card ? 1 : 0);

/**
 * The union of two logs by `(t, card)`, sorted by `t` then `card`. The first copy
 * of a key wins (local before pulled); copies of one answer are identical anyway.
 */
export function mergeLogs(local: AnswerEvent[], pulled: AnswerEvent[]): AnswerEvent[] {
  const seen = new Set<string>();
  const out: AnswerEvent[] = [];
  for (const event of [...local, ...pulled]) {
    const key = eventKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out.sort(byKey);
}

const VERDICTS = ["correct", "diacritics", "wrong"];
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** A pulled event with the fields replay needs; anything else is dropped. */
export function isWireEvent(x: unknown): x is WireEvent {
  return (
    isRecord(x) &&
    typeof x.t === "number" &&
    Number.isFinite(x.t) &&
    typeof x.day === "string" &&
    typeof x.card === "string" &&
    typeof x.skill === "string" &&
    typeof x.drill === "string" &&
    typeof x.case === "string" &&
    VERDICTS.includes(x.verdict as string) &&
    (x.miss === undefined || typeof x.miss === "string")
  );
}

/** A server `base` that looks like `Progress["base"]`, or undefined. */
export function decodeBase(base: WireBase | null | undefined): Progress["base"] | undefined {
  if (!isRecord(base)) return undefined;
  const ok = base.v === 2 && isRecord(base.cards) && isRecord(base.skills) && isRecord(base.days) && isRecord(base.cases);
  return ok ? (base as unknown as Progress["base"]) : undefined;
}

/** A base with nothing in it (the empty one `migrateV1` leaves) is not worth uploading. */
export function isEmptyBase(base: Progress["base"] | undefined): boolean {
  if (!base) return true;
  return (
    Object.keys(base.cards).length === 0 &&
    Object.keys(base.skills).length === 0 &&
    Object.keys(base.days).length === 0 &&
    Object.values(base.cases).every((stats) => !stats || Object.keys(stats).length === 0)
  );
}

/**
 * The cache after a merge: a full replay from `base`. `migrated` is kept from the
 * local cache, so v1 counts are never added twice (§7.4: a second device's own v1
 * counts are dropped when the account already had a base).
 */
export function rebuild(events: AnswerEvent[], base: Progress["base"] | undefined, migrated: boolean): Progress {
  const progress = replay(events, base);
  return migrated ? { ...progress, migrated: true } : progress;
}

/** The oldest outbox events that fit one request. */
function batch(outbox: AnswerEvent[], keepalive: boolean): AnswerEvent[] {
  const events = outbox.slice(0, SYNC_MAX_PUSH);
  if (!keepalive) return events;
  let bytes = 0;
  let n = 0;
  for (const event of events) {
    bytes += JSON.stringify(event).length + 1;
    if (bytes > KEEPALIVE_MAX_BYTES) break;
    n++;
  }
  return events.slice(0, n);
}

type Outgoing = { request: SyncRequest; pushed: AnswerEvent[]; settingsSent?: number; profileSent?: number };

function outgoing(state: SyncState, first: boolean, keepalive: boolean): Outgoing {
  const pushed = batch(readOutbox(), keepalive);
  const request: SyncRequest = { cursor: state.cursor, events: pushed };
  const out: Outgoing = { request, pushed };

  // a value never stamped counts as 0, so the account's wins (§7.5); 1 keeps it a valid time
  if (hasStoredSettings() && (state.settingsSynced === undefined || state.settingsAt > state.settingsSynced)) {
    const updatedAt = Math.max(state.settingsAt, 1);
    request.settings = { value: readSettings(), updatedAt } satisfies Stamped<Settings>;
    out.settingsSent = updatedAt;
  }
  if (hasStoredProfile() && (state.profileSynced === undefined || state.profileAt > state.profileSynced)) {
    const updatedAt = Math.max(state.profileAt, 1);
    request.profile = { value: readProfile(), updatedAt } satisfies Stamped<Profile>;
    out.profileSent = updatedAt;
  }

  if (first) {
    const base = readLoadedProgress()?.base;
    if (!isEmptyBase(base)) request.base = base as unknown as WireBase;
  }
  return out;
}

/** Folds one response into local storage. Throws only from the progress logic, before any write. */
function absorb(sent: Outgoing, res: SyncResponse, first: boolean): void {
  const local = readLoadedProgress();
  const pulled = (Array.isArray(res.events) ? res.events : []).filter(isWireEvent) as AnswerEvent[];

  // the first sync replays from the account's base (first device wins, §7.3); later ones keep the local one
  const localBase = local?.base;
  const base = first ? (decodeBase(res.base) ?? localBase) : localBase;
  const log = readLogEvents();
  const merged = mergeLogs(log, pulled);
  const changed = merged.length !== log.length || base !== localBase || local === null;
  const progress = changed ? rebuild(merged, base, local?.migrated ?? false) : null;

  // nothing above wrote; from here on only storage writes
  if (progress) writeLogAndProgress(merged, progress);

  const pushedKeys = new Set(sent.pushed.map(eventKey));
  if (pushedKeys.size) writeOutbox(readOutbox().filter((e) => !pushedKeys.has(eventKey(e))));

  const state = readSyncState();
  const next: SyncState = { ...state, cursor: typeof res.cursor === "number" ? res.cursor : state.cursor };

  if (res.settings && typeof res.settings.updatedAt === "number" && res.settings.updatedAt > state.settingsAt) {
    adoptSettings(res.settings.value, res.settings.updatedAt);
    next.settingsAt = res.settings.updatedAt;
  }
  if (sent.settingsSent !== undefined || res.settings) {
    next.settingsSynced = Math.max(sent.settingsSent ?? 0, res.settings?.updatedAt ?? 0, state.settingsSynced ?? 0);
  }
  if (res.profile && typeof res.profile.updatedAt === "number" && res.profile.updatedAt > state.profileAt) {
    adoptProfile(res.profile.value, res.profile.updatedAt);
    next.profileAt = res.profile.updatedAt;
  }
  if (sent.profileSent !== undefined || res.profile) {
    next.profileSynced = Math.max(sent.profileSent ?? 0, res.profile?.updatedAt ?? 0, state.profileSynced ?? 0);
  }

  // a first sync that brought this device's own progress into the account: the UI says so once
  if (first && (sent.pushed.length > 0 || sent.request.base)) next.merged = true;
  next.joined = true;

  writeSyncState(next);
}

let inflight: Promise<SyncResult> | null = null;
let lastSync = 0;

export type SyncOptions = {
  /** Skip the 30 s throttle (after a session, after sign-in). */
  force?: boolean;
  /** The page is being hidden: one small `keepalive` request. */
  keepalive?: boolean;
};

async function run(keepalive: boolean): Promise<SyncResult> {
  lastSync = Date.now();
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (!readStoredAccount()) return "skipped";
      const state = readSyncState();
      // the first sync since sign-in, until one succeeds (the cursor stays 0 on an empty account)
      const first = !state.joined;
      const sent = outgoing(state, first, keepalive);
      const res = await request<SyncResponse>("/sync", { body: sent.request, auth: true, keepalive });
      if (!readStoredAccount()) return "skipped"; // signed out while waiting
      try {
        absorb(sent, res, first);
      } catch {
        return "error";
      }
      if (keepalive) return "ok";
      if (!res.more && readOutbox().length === 0) return "ok";
    }
    return "ok";
  } catch (error) {
    if (error instanceof ApiFailure && error.code === "network") return "offline";
    return "error";
  }
}

/**
 * Pushes the outbox and pulls other devices' answers, settings and name.
 * "skipped": accounts off, signed out, throttled or already running.
 */
export function syncNow(opts: SyncOptions = {}): Promise<SyncResult> {
  if (!apiEnabled() || !readStoredAccount()) return Promise.resolve("skipped");
  if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve("offline");
  if (inflight) {
    if (!opts.force) return Promise.resolve("skipped");
    // forced while one runs: go again right after it, so nothing answered meanwhile waits
    return inflight.then(() => syncNow(opts));
  }
  if (!opts.force && Date.now() - lastSync < SYNC_THROTTLE_MS) return Promise.resolve("skipped");
  const running = run(!!opts.keepalive).finally(() => {
    if (inflight === running) inflight = null;
  });
  inflight = running;
  return running;
}

/** Test hook: forget the throttle and any running sync. */
export function resetSyncForTests(): void {
  inflight = null;
  lastSync = 0;
}

let lastMe = 0;

/** `GET /me` at most once per throttle window (§5: app start, `online`, focus). */
function refreshMe(force: boolean): void {
  if (!readStoredAccount()) return;
  if (!force && Date.now() - lastMe < SYNC_THROTTLE_MS) return;
  lastMe = Date.now();
  void fetchMe().catch(() => {
    // offline: the cached entitlement holds (hasAccess)
  });
}

/**
 * Syncs and refreshes the entitlement on app start, on `online`, on focus, and
 * pushes the outbox with `keepalive` when the page is hidden. Returns the
 * cleanup. A no-op when accounts are off.
 */
export function startAutoSync(): () => void {
  if (!apiEnabled() || typeof window === "undefined") return () => {};
  const quiet = (p: Promise<unknown>) => void p.catch(() => {});

  refreshMe(true);
  quiet(syncNow({ force: true }));

  const onOnline = () => {
    refreshMe(true);
    quiet(syncNow({ force: true }));
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      refreshMe(false);
      quiet(syncNow());
    } else {
      // leaving: push what was answered, in one small request the browser finishes for us
      quiet(syncNow({ keepalive: true, force: readOutbox().length > 0 }));
    }
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
