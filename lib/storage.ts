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
import { DRILL_KINDS } from "./types";
import type { Config, DrillKind, Exercise, ExerciseKind, Stats } from "./types";

/**
 * localStorage wiring (plans/phase-2.md §4). Schema v2 is an append-only answer
 * log plus a progress cache derived from it; the pure logic is in lib/progress.ts.
 * Every read is safe when storage is unavailable, and every call into the
 * progress logic is guarded so a bug there never stops a practice session.
 */

const configKey = (kind: ExerciseKind) => `polish.config.${kind}.v1`;
const v1StatsKey = (kind: ExerciseKind) => `polish.stats.${kind}.v1`;
const SOUND_KEY = "polish.sound.v1";
export const LOG_KEY = "polish.log.v2";
export const PROGRESS_KEY = "polish.progress.v2";
export const SETTINGS_KEY = "polish.settings.v2";

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
    let progress: Progress | null = null;
    if (current.ok) {
      try {
        progress = apply(current.progress, event);
        if (events.length > COMPACT_AT) {
          try {
            const compacted = compact(progress, events, COMPACT_KEEP);
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

export const saveSettings = (settings: Settings) => write(SETTINGS_KEY, decodeSettings(settings));

// ---- rendering helpers ----------------------------------------------------------

const noSubscribe = () => () => {};

/** False on the server and during hydration, true after: gate anything that reads the clock or storage. */
export const useHydrated = (): boolean =>
  useSyncExternalStore(noSubscribe, () => true, () => false);
