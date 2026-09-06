"use client";

import { useSyncExternalStore } from "react";
import type { Case, Config, Stats } from "./types";

const CONFIG_KEY = "polish.config.v1";
const STATS_KEY = "polish.stats.v1";
const SOUND_KEY = "polish.sound.v1";

/** Stable fallbacks — useSyncExternalStore needs referentially stable snapshots. */
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

function snapshot<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return fallback;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value = fallback;
  try {
    if (raw) value = JSON.parse(raw) as T;
  } catch {
    value = fallback;
  }
  cache.set(key, { raw, value });
  return value;
}

function useStored<T>(key: string, fallback: T): T {
  return useSyncExternalStore(
    subscribe,
    () => snapshot(key, fallback),
    () => fallback,
  );
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage disabled — practice still works, we just forget the settings
  }
  cache.delete(key);
  listeners.forEach((fn) => fn());
}

/** Last used configurator settings, or null on a first visit. */
export const useStoredConfig = (): Config | null =>
  useStored<Config | null>(CONFIG_KEY, NO_CONFIG);

/** Lifetime accuracy per case. */
export const useStoredStats = (): Stats => useStored<Stats>(STATS_KEY, NO_STATS);

export const saveConfig = (config: Config) => write(CONFIG_KEY, config);

/** Whether answer sounds play; defaults to on. */
export const useSoundOn = (): boolean => useStored<boolean>(SOUND_KEY, SOUND_ON);

export const setSoundOn = (on: boolean) => write(SOUND_KEY, on);

export function recordAnswer(kase: Case, correct: boolean): void {
  const stats = { ...snapshot(STATS_KEY, NO_STATS) };
  const entry = stats[kase] ?? { correct: 0, total: 0 };
  stats[kase] = { correct: entry.correct + (correct ? 1 : 0), total: entry.total + 1 };
  write(STATS_KEY, stats);
}
