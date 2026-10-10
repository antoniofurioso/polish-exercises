"use client";

import { useSyncExternalStore } from "react";
import { drillOfCard } from "./cards";
import type { Verdict } from "./grade";
import { missKindOf } from "./missKind";
import {
  apply,
  compact,
  DEFAULT_SETTINGS,
  EMPTY_PROGRESS,
  GOAL_CHOICES,
  migrateV1,
  replay,
  type AnswerEvent,
  type Progress,
  type Settings,
} from "./progress";
import { dayKey } from "./srs";
import { resumableToday, type SavedToday } from "./today";
import { THEME_KEY, THEMES, type Theme } from "./theme";

export type { Theme } from "./theme";
import { DRILL_KINDS } from "./types";
import type { Config, DrillKind, Exercise, ExerciseKind, Stats } from "./types";
import type { Entitlement, PublicConfig, User } from "../workers/api/src/contract";

/**
 * localStorage wiring (plans/phase-2.md §4). Schema v2 is an append-only answer
 * log plus a progress cache derived from it; the pure logic is in lib/progress.ts.
 * Every read is safe when storage is unavailable, and every call into the
 * progress logic is guarded so a bug there never stops a practice session.
 */

const configKey = (kind: ExerciseKind) => `polish.config.${kind}.v1`;
const v1StatsKey = (kind: ExerciseKind) => `polish.stats.${kind}.v1`;
const SOUND_KEY = "polish.sound.v1";
const PROFILE_KEY = "polish.profile.v1";
const TODAY_KEY = "polish.today.v1";
const INSTALL_CARD_KEY = "polish.installCard.v1";
export const LOG_KEY = "polish.log.v2";
export const PROGRESS_KEY = "polish.progress.v2";
export const SETTINGS_KEY = "polish.settings.v2";
/** Phase 4 (plans/phase-4.md §5, §6.1): the account cache, unsynced events, sync cursor and stamps. */
export const ACCOUNT_KEY = "polish.account.v1";
export const OUTBOX_KEY = "polish.outbox.v1";
export const SYNC_KEY = "polish.sync.v1";
/** `GET /config`, cached; kept on sign-out (it is not about the account). */
export const PUBLIC_CONFIG_KEY = "polish.apiConfig.v1";

/** The log is compacted past this many events, keeping the newest COMPACT_KEEP. */
const COMPACT_AT = 20_000;
const COMPACT_KEEP = 10_000;

/** Stable fallbacks: useSyncExternalStore needs referentially stable snapshots. */
const NO_CONFIG: Config | null = null;
const NO_STATS: Stats = {};
const SOUND_ON = true;

const cache = new Map<string, { raw: string | null; value: unknown }>();
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function notify(): void {
  listeners.forEach((fn) => fn());
}

/** The raw string at `key`; undefined when storage cannot be read at all. */
function readRaw(key: string): string | null | undefined {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return undefined;
  }
}

function writeRaw(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // storage disabled or full: practice still works, we just forget
  }
}

function parse(raw: string | null | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** The decoded value at `key`, memoised on the raw string so it is referentially stable. */
function snapshot<T>(key: string, fallback: T, decode: (value: unknown) => T = (v) => v as T): T {
  const raw = readRaw(key);
  if (raw === undefined) return fallback;
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  const parsed = parse(raw);
  let value = fallback;
  try {
    if (parsed !== undefined) value = decode(parsed);
  } catch {
    value = fallback;
  }
  cache.set(key, { raw, value });
  return value;
}

function useStored<T>(key: string, fallback: T, decode?: (value: unknown) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => snapshot(key, fallback, decode),
    () => fallback,
  );
}

function write(key: string, value: unknown): void {
  writeRaw(key, JSON.stringify(value));
  cache.delete(key);
  notify();
}

// ---- v1: configurator settings and sound -----------------------------------

/** Last used configurator settings for an exercise, or null on a first visit. */
export const useStoredConfig = (kind: ExerciseKind): Config | null =>
  useStored<Config | null>(configKey(kind), NO_CONFIG);

export const saveConfig = (kind: ExerciseKind, config: Config) => write(configKey(kind), config);

/** Whether answer sounds play; defaults to on. */
export const useSoundOn = (): boolean => useStored<boolean>(SOUND_KEY, SOUND_ON);

export const setSoundOn = (on: boolean) => write(SOUND_KEY, on);

// ---- v2: answer log and progress cache --------------------------------------

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

function isProgress(x: unknown): x is Progress {
  return (
    isRecord(x) &&
    x.v === 2 &&
    isRecord(x.cards) &&
    isRecord(x.skills) &&
    isRecord(x.days) &&
    isRecord(x.cases)
  );
}

function readLog(): AnswerEvent[] {
  const parsed = parse(readRaw(LOG_KEY));
  return Array.isArray(parsed) ? (parsed as AnswerEvent[]) : [];
}

function readV1Stats(): Partial<Record<DrillKind, Stats>> {
  const v1: Partial<Record<DrillKind, Stats>> = {};
  for (const kind of DRILL_KINDS) {
    const parsed = parse(readRaw(v1StatsKey(kind)));
    if (isRecord(parsed)) v1[kind] = parsed as Stats;
  }
  return v1;
}

/** Progress that could be read, or null when the logic failed and we fell back. */
type Loaded = { progress: Progress; ok: boolean };
const FAILED: Loaded = { progress: EMPTY_PROGRESS, ok: false };
let loaded: { raw: string | null; value: Loaded } | null = null;

/**
 * The progress cache. A valid cache is only parsed; a missing or corrupt one is
 * rebuilt by replaying the log (from the old `base` when it survived), and the
 * v1 per-case stats are migrated in once. A rebuilt cache is persisted quietly
 * (no listeners fire: this can run during render).
 */
function loadProgress(): Loaded {
  const raw = readRaw(PROGRESS_KEY);
  if (raw === undefined) return FAILED;
  if (loaded && loaded.raw === raw) return loaded.value;

  const parsed = parse(raw);
  let value: Loaded;
  try {
    let progress: Progress;
    let changed = false;
    if (isProgress(parsed)) {
      progress = parsed;
    } else {
      const base = isRecord(parsed) && isRecord(parsed.base) ? (parsed.base as Progress["base"]) : undefined;
      const events = readLog();
      progress = events.length > 0 || base ? replay(events, base) : EMPTY_PROGRESS;
      changed = true;
    }
    if (!progress.migrated) {
      progress = migrateV1(progress, readV1Stats());
      changed = true;
    }
    value = { progress, ok: true };
    if (changed) {
      const next = JSON.stringify(progress);
      writeRaw(PROGRESS_KEY, next);
      const stored = readRaw(PROGRESS_KEY);
      loaded = { raw: stored === undefined ? raw : stored, value };
      return value;
    }
  } catch {
    value = FAILED;
  }
  loaded = { raw, value };
  return value;
}

const progressSnapshot = (): Progress => loadProgress().progress;
const serverProgress = (): Progress => EMPTY_PROGRESS;

/** The learner's progress, live. EMPTY_PROGRESS on the server and when it cannot be read. */
export const useProgress = (): Progress =>
  useSyncExternalStore(subscribe, progressSnapshot, serverProgress);

/** Whether the progress logic works on this device (false while it throws or storage is off). */
export const useProgressReady = (): boolean =>
  useSyncExternalStore(subscribe, () => loadProgress().ok, () => false);

/** A one-off read, e.g. the snapshot /today builds its session from. */
export const readProgress = (): Progress => loadProgress().progress;

/**
 * Lifetime accuracy per case for a drill's configurator: the v2 per-drill × case
 * counts, or the v1 counts while the v2 progress cannot be loaded.
 */
export function useStoredStats(kind: ExerciseKind): Stats {
  const progress = useProgress();
  const ready = useProgressReady();
  const v1 = useStored<Stats>(v1StatsKey(kind), NO_STATS);
  if (!ready) return v1;
  return (kind !== "shuffle" && progress.cases[kind]) || NO_STATS;
}

/**
 * Logs one answer and folds it into the progress cache. The log is written
 * first: it is the source of truth, so a failing `apply` only drops the cache,
 * which is rebuilt by replay on the next load.
 */
export function recordAnswer(exercise: Exercise, kind: ExerciseKind, verdict: Verdict, input: string): void {
  try {
    const drill: DrillKind =
      exercise.kind ??
      (exercise.card ? drillOfCard(exercise.card, DRILL_KINDS) : null) ??
      (kind === "shuffle" ? "cases" : kind);
    const fallbackId = `${drill}:${exercise.case}|${exercise.number}`;
    let miss;
    if (verdict === "wrong") {
      try {
        miss = missKindOf(input, exercise);
      } catch {
        miss = undefined;
      }
    }
    const t = Date.now();
    const event: AnswerEvent = {
      t,
      day: dayKey(t),
      card: exercise.card ?? fallbackId,
      skill: exercise.skill ?? fallbackId,
      verdict,
      ...(miss ? { miss } : {}),
      drill,
      case: exercise.case,
    };

    const current = loadProgress();
    let events = [...readLog(), event];
    const signedIn = readStoredAccount() !== null;
    const outbox = signedIn ? [...readOutbox(), event] : [];
    let progress: Progress | null = null;
    if (current.ok) {
      try {
        progress = apply(current.progress, event);
        if (events.length > COMPACT_AT) {
          try {
            const compacted = compact(progress, events, outboxSafeKeep(events, outbox, COMPACT_KEEP));
            progress = compacted.progress;
            events = compacted.events;
          } catch {
            // keep the full log; compaction is retried on the next answer
          }
        }
      } catch {
        progress = null;
      }
    }

    writeRaw(LOG_KEY, JSON.stringify(events));
    // the same write as the log: an event answered while signed in waits here for the server
    if (signedIn) writeRaw(OUTBOX_KEY, JSON.stringify(outbox));
    if (progress) {
      writeRaw(PROGRESS_KEY, JSON.stringify(progress));
    } else if (!current.ok || !current.progress.base) {
      // stale cache: drop it so the next load replays the log (a cache holding a
      // compaction base is kept, as the base cannot be rebuilt)
      writeRaw(PROGRESS_KEY, null);
    }
    notify();
  } catch {
    // never let recording break practice
  }
}

// ---- v2: settings -------------------------------------------------------------

function decodeSettings(value: unknown): Settings {
  if (!isRecord(value)) return DEFAULT_SETTINGS;
  const goal = (GOAL_CHOICES as readonly number[]).includes(value.goal as number)
    ? (value.goal as number)
    : DEFAULT_SETTINGS.goal;
  const n = value.newPerDay;
  const newPerDay =
    typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100 ? n : DEFAULT_SETTINGS.newPerDay;
  return { goal, newPerDay };
}

/** Daily goal and new cards per day, defaults filled in. */
export const useSettings = (): Settings => useStored<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS, decodeSettings);

export const readSettings = (): Settings => snapshot(SETTINGS_KEY, DEFAULT_SETTINGS, decodeSettings);

export function saveSettings(settings: Settings): void {
  stampSync({ settingsAt: Date.now() });
  write(SETTINGS_KEY, decodeSettings(settings));
}

/** Writes settings that came from the account (sync), stamped with the account's time. */
export function adoptSettings(settings: Settings, updatedAt: number): void {
  stampSync({ settingsAt: updatedAt });
  write(SETTINGS_KEY, decodeSettings(settings));
}

/** Whether the learner ever saved settings on this device (the defaults are not synced). */
export const hasStoredSettings = (): boolean => !!readRaw(SETTINGS_KEY);

// ---- appearance and profile ---------------------------------------------------

const decodeTheme = (value: unknown): Theme => (THEMES.includes(value as Theme) ? (value as Theme) : "system");

/** Light, dark or the device's setting; applied to <html data-theme> (and before paint by the script in app/layout.tsx). */
export const useTheme = (): Theme => useStored<Theme>(THEME_KEY, "system", decodeTheme);

export function setTheme(theme: Theme): void {
  write(THEME_KEY, theme);
  try {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  } catch {
    // no document (tests): the stored choice applies on the next load
  }
}

/** What the learner told us about themselves; on this device only until accounts exist. */
export type Profile = { name: string };
const NO_PROFILE: Profile = { name: "" };
export const PROFILE_NAME_MAX = 40;

function decodeProfile(value: unknown): Profile {
  if (!isRecord(value) || typeof value.name !== "string") return NO_PROFILE;
  return { name: value.name.trim().slice(0, PROFILE_NAME_MAX) };
}

export const useProfile = (): Profile => useStored<Profile>(PROFILE_KEY, NO_PROFILE, decodeProfile);

export function saveProfile(profile: Profile): void {
  stampSync({ profileAt: Date.now() });
  write(PROFILE_KEY, decodeProfile(profile));
}

export const readProfile = (): Profile => snapshot(PROFILE_KEY, NO_PROFILE, decodeProfile);

/** Writes a profile that came from the account (sync), stamped with the account's time. */
export function adoptProfile(profile: Profile, updatedAt: number): void {
  stampSync({ profileAt: updatedAt });
  write(PROFILE_KEY, decodeProfile(profile));
}

export const hasStoredProfile = (): boolean => !!readRaw(PROFILE_KEY);

// ---- today's session and the install card ----------------------------------------

/** Today's unfinished session, to resume on /today; null for another day's, a finished or a corrupt one. */
export function readTodaySession(day: string): SavedToday | null {
  return resumableToday(parse(readRaw(TODAY_KEY)), day);
}

/** Keeps today's session after an answer; a finished one is dropped, so the next visit builds afresh. */
export function saveTodaySession(saved: SavedToday): void {
  writeRaw(TODAY_KEY, resumableToday(saved, saved.day) ? JSON.stringify(saved) : null);
}

export const clearTodaySession = () => writeRaw(TODAY_KEY, null);

/** The learner closed the "add to home screen" card; it never comes back. */
/** The practice day the install card was last closed on (lib/install.ts), 0 if never. */
export const useInstallCardDismissedOn = (): number =>
  useStored<number>(INSTALL_CARD_KEY, 0, (v) =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0,
  );

export const dismissInstallCard = (practiceDay: number) => write(INSTALL_CARD_KEY, practiceDay);

// ---- Phase 4: account cache, outbox and sync state (plans/phase-4.md §5, §6) ----------

/** What polish.account.v1 holds while signed in. */
export type StoredAccount = {
  token: string;
  email: string;
  user: User | null;
  entitlement: Entitlement | null;
};

/** The signed-in account as the UI sees it; null when signed out. */
export type AccountState = StoredAccount & { config: PublicConfig | null };

function decodeAccount(value: unknown): StoredAccount | null {
  if (!isRecord(value) || typeof value.token !== "string" || !value.token) return null;
  return {
    token: value.token,
    email: typeof value.email === "string" ? value.email : "",
    user: isRecord(value.user) ? (value.user as User) : null,
    entitlement: isRecord(value.entitlement) ? (value.entitlement as Entitlement) : null,
  };
}

const decodePublicConfig = (value: unknown): PublicConfig | null =>
  isRecord(value) && typeof value.betaOpen === "boolean" ? (value as PublicConfig) : null;

/** The stored account, or null when signed out or unreadable. */
export const readStoredAccount = (): StoredAccount | null => snapshot(ACCOUNT_KEY, null, decodeAccount);

/** Saves the account (null signs out locally: only the account key is removed). */
export function writeStoredAccount(account: StoredAccount | null): void {
  if (account) write(ACCOUNT_KEY, account);
  else {
    writeRaw(ACCOUNT_KEY, null);
    cache.delete(ACCOUNT_KEY);
    notify();
  }
}

/** `GET /config` as last fetched, or null. */
export const readPublicConfig = (): PublicConfig | null => snapshot(PUBLIC_CONFIG_KEY, null, decodePublicConfig);

export const writePublicConfig = (config: PublicConfig) => write(PUBLIC_CONFIG_KEY, config);

/** `GET /config` as last fetched, live; null before the first fetch, on the server and during hydration. */
export const usePublicConfig = (): PublicConfig | null =>
  useSyncExternalStore(subscribe, readPublicConfig, () => null);

let composed: { account: StoredAccount; config: PublicConfig | null; value: AccountState } | null = null;

/** The signed-in account with the cached config; null when signed out. Referentially stable. */
export function readAccount(): AccountState | null {
  const account = readStoredAccount();
  if (!account) return null;
  const config = readPublicConfig();
  if (composed && composed.account === account && composed.config === config) return composed.value;
  composed = { account, config, value: { ...account, config } };
  return composed.value;
}

/** The signed-in account, live; null when signed out, on the server and during hydration. */
export const useAccount = (): AccountState | null => useSyncExternalStore(subscribe, readAccount, () => null);

/** An event's identity across devices (plans/phase-4.md: the event key). */
export const eventKey = (e: Pick<AnswerEvent, "t" | "card">): string => `${e.t}|${e.card}`;

/**
 * How many of the newest log events compaction must keep so that no event still
 * in the outbox is folded into `base` (§6.5): at least `keep`, and everything from
 * the oldest outbox event on.
 */
export function outboxSafeKeep(events: AnswerEvent[], outbox: AnswerEvent[], keep: number): number {
  if (outbox.length === 0) return keep;
  const pending = new Set(outbox.map(eventKey));
  const first = events.findIndex((e) => pending.has(eventKey(e)));
  return first < 0 ? keep : Math.max(keep, events.length - first);
}

/** Events answered while signed in that the server has not acknowledged, oldest first. */
export function readOutbox(): AnswerEvent[] {
  const parsed = parse(readRaw(OUTBOX_KEY));
  return Array.isArray(parsed) ? (parsed as AnswerEvent[]) : [];
}

export function writeOutbox(events: AnswerEvent[]): void {
  writeRaw(OUTBOX_KEY, events.length ? JSON.stringify(events) : null);
}

/** The answer log (polish.log.v2), oldest first. */
export const readLogEvents = (): AnswerEvent[] => readLog();

/** The progress cache as loaded (null when the progress logic fails on this device). */
export function readLoadedProgress(): Progress | null {
  const current = loadProgress();
  return current.ok ? current.progress : null;
}

/** Replaces the log and the cache together (a sync merge) and tells the hooks. */
export function writeLogAndProgress(events: AnswerEvent[], progress: Progress): void {
  writeRaw(LOG_KEY, JSON.stringify(events));
  writeRaw(PROGRESS_KEY, JSON.stringify(progress));
  notify();
}

/**
 * polish.sync.v1. `cursor`: highest server seq received. `settingsAt` / `profileAt`:
 * when the local value last changed (0 = never stamped). `settingsSynced` /
 * `profileSynced`: the stamp the server is known to hold. `merged`: the first sync
 * folded this device's own progress into the account (the UI says so once).
 * `joined`: a first sync since sign-in has succeeded (cleared on sign-out).
 */
export type SyncState = {
  cursor: number;
  settingsAt: number;
  profileAt: number;
  settingsSynced?: number;
  profileSynced?: number;
  merged?: boolean;
  joined?: boolean;
};

const NO_SYNC: SyncState = { cursor: 0, settingsAt: 0, profileAt: 0 };
const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 0);

function decodeSync(value: unknown): SyncState {
  if (!isRecord(value)) return NO_SYNC;
  const out: SyncState = { cursor: num(value.cursor), settingsAt: num(value.settingsAt), profileAt: num(value.profileAt) };
  if (typeof value.settingsSynced === "number") out.settingsSynced = num(value.settingsSynced);
  if (typeof value.profileSynced === "number") out.profileSynced = num(value.profileSynced);
  if (value.merged === true) out.merged = true;
  if (value.joined === true) out.joined = true;
  return out;
}

export const readSyncState = (): SyncState => snapshot(SYNC_KEY, NO_SYNC, decodeSync);

export const writeSyncState = (state: SyncState) => write(SYNC_KEY, state);

/** Merges fields into polish.sync.v1 without notifying (the caller's own write does). */
function stampSync(patch: Partial<SyncState>): void {
  writeRaw(SYNC_KEY, JSON.stringify({ ...readSyncState(), ...patch }));
  cache.delete(SYNC_KEY);
}

/** True once after a first sync merged this device's progress into the account. */
export const useMergedNotice = (): boolean =>
  useSyncExternalStore(subscribe, () => readSyncState().merged === true, () => false);

export function dismissMergedNotice(): void {
  const next = { ...readSyncState() };
  delete next.merged;
  writeSyncState(next);
}

/**
 * Signing out (or a 401): the token, cached entitlement, outbox and cursor go;
 * the log, progress, settings and profile stay on this device (§7). The
 * settings / profile stamps stay too: they describe the local values.
 */
export function clearAccountState(): void {
  const { settingsAt, profileAt } = readSyncState();
  writeRaw(OUTBOX_KEY, null);
  writeRaw(SYNC_KEY, JSON.stringify({ cursor: 0, settingsAt, profileAt }));
  cache.delete(SYNC_KEY);
  writeStoredAccount(null);
}

/**
 * Signing in: the outbox becomes the whole local log (deduplicated with any
 * leftover outbox), and the cursor starts at 0 (§7.1).
 */
export function startAccountState(account: StoredAccount): void {
  const seen = new Set<string>();
  const outbox: AnswerEvent[] = [];
  for (const e of [...readLog(), ...readOutbox()]) {
    const key = eventKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    outbox.push(e);
  }
  outbox.sort((a, b) => a.t - b.t || (a.card < b.card ? -1 : a.card > b.card ? 1 : 0));
  writeOutbox(outbox);
  const { settingsAt, profileAt } = readSyncState();
  writeRaw(SYNC_KEY, JSON.stringify({ cursor: 0, settingsAt, profileAt }));
  cache.delete(SYNC_KEY);
  write(ACCOUNT_KEY, account);
}

// ---- rendering helpers ----------------------------------------------------------

const noSubscribe = () => () => {};

/** False on the server and during hydration, true after: gate anything that reads the clock or storage. */
export const useHydrated = (): boolean =>
  useSyncExternalStore(noSubscribe, () => true, () => false);
