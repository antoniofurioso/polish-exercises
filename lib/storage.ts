"use client";

import { useSyncExternalStore } from "react";
import type { Case, Config, ExerciseKind, Stats } from "./types";

const configKey = (kind: ExerciseKind) => `polish.config.${kind}.v1`;
const statsKey = (kind: ExerciseKind) => `polish.stats.${kind}.v1`;
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

/** Last used configurator settings for an exercise, or null on a first visit. */
export const useStoredConfig = (kind: ExerciseKind): Config | null =>
  useStored<Config | null>(configKey(kind), NO_CONFIG);

/** Lifetime accuracy per case, kept separately for each exercise. */
export const useStoredStats = (kind: ExerciseKind): Stats =>
  useStored<Stats>(statsKey(kind), NO_STATS);

export const saveConfig = (kind: ExerciseKind, config: Config) =>
  write(configKey(kind), config);

/** Whether answer sounds play; defaults to on. */
export const useSoundOn = (): boolean => useStored<boolean>(SOUND_KEY, SOUND_ON);

export const setSoundOn = (on: boolean) => write(SOUND_KEY, on);

export function recordAnswer(kind: ExerciseKind, kase: Case, correct: boolean): void {
  const key = statsKey(kind);
  const stats = { ...snapshot(key, NO_STATS) };
  const entry = stats[kase] ?? { correct: 0, total: 0 };
  stats[kase] = { correct: entry.correct + (correct ? 1 : 0), total: entry.total + 1 };
  write(key, stats);
}
