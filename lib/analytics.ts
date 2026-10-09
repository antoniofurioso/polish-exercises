/**
 * Product analytics, only with consent (plans/phase-3.md §4).
 *
 * `track(event, props)` is a no-op unless `NEXT_PUBLIC_POSTHOG_KEY` was set at
 * build time AND the learner chose "Allow analytics". posthog-js is loaded with
 * a dynamic `import()` only after that, so it is not in the first-load bundle
 * and nothing reaches PostHog (no request, no cookie, no storage) before
 * consent. Props are checked against a fixed schema per event: only enum values
 * and counts get through, never answer text or anything personal.
 *
 * The decision logic (`createAnalytics`, `nextConsent`, `cleanProps`,
 * `goalMetProps`) takes its browser parts as arguments, so it runs in plain
 * Node tests; the module-level `track` / `setConsent` wire it to the page.
 * This module is mounted on every page (components/Analytics), so it imports
 * no runtime code beyond lib/types: not the lexicon, not the progress logic.
 */
import { useSyncExternalStore } from "react";
import type { Verdict } from "./grade";
import { EXERCISE_KINDS, type ExerciseKind } from "./types";

// ---- consent ------------------------------------------------------------------

export const CONSENT_KEY = "polish.consent.v1";
/** The day (`dayKey`) goal_met was last sent, so it goes out once per day. */
export const GOAL_SENT_KEY = "polish.analytics.goal.v1";

/** null: no choice yet (the banner shows when a key is configured). */
export type Consent = "granted" | "denied" | null;

export function decodeConsent(raw: string | null | undefined): Consent {
  return raw === "granted" || raw === "denied" ? raw : null;
}

/** What has to happen when the learner changes their choice. */
export type ConsentEffect = "load" | "optOut";

/**
 * The consent state machine. Allowing loads PostHog; denying after allowing opts
 * it out and clears its storage; a first "No thanks" or a repeated choice does
 * nothing beyond remembering it.
 */
export function nextConsent(
  current: Consent,
  choice: "granted" | "denied",
): { consent: Consent; effects: ConsentEffect[] } {
  if (current === choice) return { consent: current, effects: [] };
  if (choice === "granted") return { consent: "granted", effects: ["load"] };
  return { consent: "denied", effects: current === "granted" ? ["optOut"] : [] };
}

/** The banner asks only when analytics exist in this build and no choice was made. */
export const shouldAsk = (keyConfigured: boolean, consent: Consent | undefined): boolean =>
  keyConfigured && consent === null;

// ---- events -------------------------------------------------------------------

export type Source = "today" | "practice";

export type EventProps = {
  session_started: { source: Source; drill: ExerciseKind; size: number };
  answer: { drill: ExerciseKind; verdict: Verdict };
  session_finished: { source: Source; size: number; correct: number };
  goal_met: { goal: number; streak: number };
  pwa_installed: Record<string, never>;
};
export type EventName = keyof EventProps;

type Check = (value: unknown) => boolean;
const oneOf =
  (values: readonly string[]): Check =>
  (v) =>
    typeof v === "string" && values.includes(v);
const count: Check = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100_000;

const SOURCES = ["today", "practice"] as const;
const VERDICTS = ["correct", "diacritics", "wrong"] as const;

/** Every event and the only props it may carry. Anything else is dropped. */
export const EVENT_SCHEMA: { [E in EventName]: { [P in keyof EventProps[E]]-?: Check } } = {
  session_started: { source: oneOf(SOURCES), drill: oneOf(EXERCISE_KINDS), size: count },
  answer: { drill: oneOf(EXERCISE_KINDS), verdict: oneOf(VERDICTS) },
  session_finished: { source: oneOf(SOURCES), size: count, correct: count },
  goal_met: { goal: count, streak: count },
  pwa_installed: {},
};

/**
 * The props that may be sent for `event`: only schema keys whose value passes
 * its check (an enum value or a small whole number). Null for an unknown event.
 */
export function cleanProps(event: string, props: Record<string, unknown>): Record<string, string | number> | null {
  if (!Object.hasOwn(EVENT_SCHEMA, event)) return null;
  const schema = EVENT_SCHEMA[event as EventName] as Record<string, Check>;
  const out: Record<string, string | number> = {};
  for (const [key, check] of Object.entries(schema)) {
    const value = props[key];
    if (check(value)) out[key] = value as string | number;
  }
  return out;
}

/** Today's numbers goal_met is decided from (computed by the caller, which has the progress). */
export type GoalCheck = {
  /** Questions answered today. */
  answered: number;
  goal: number;
  /** The current streak (`streak(...).current` from lib/progress). */
  streak: number;
  /** Today's `dayKey`. */
  today: string;
  /** The day goal_met was last sent (stored at GOAL_SENT_KEY), or null. */
  lastSent: string | null;
};

/** goal_met's props when today's goal is met and it was not sent today yet; null otherwise. */
export function goalMetProps(check: GoalCheck): EventProps["goal_met"] | null {
  if (check.lastSent === check.today || check.answered < check.goal) return null;
  return { goal: check.goal, streak: check.streak };
}

// ---- the PostHog wrapper ------------------------------------------------------

/** The parts of the PostHog instance used here. */
export interface PostHogLike {
  capture(event: string, props?: Record<string, unknown>): unknown;
  opt_out_capturing(): void;
  opt_in_capturing(options?: { captureEventName?: false }): void;
  reset(): void;
  set_config(config: Record<string, unknown>): void;
}

/** Config that keeps an already-loaded instance silent after "No thanks", even with its storage cleared. */
export const SILENT_CONFIG = {
  opt_out_capturing_by_default: true,
  disable_persistence: true,
  capture_pageview: false,
} as const;
/** Undoes SILENT_CONFIG when the learner allows analytics again on the same page. */
export const ACTIVE_CONFIG = {
  opt_out_capturing_by_default: false,
  disable_persistence: false,
  capture_pageview: "history_change",
} as const;

export interface AnalyticsEnv {
  /** The project key inlined at build time; empty means analytics off. */
  key: string;
  readConsent(): Consent;
  writeConsent(consent: Consent): void;
  /** Imports and initialises posthog-js. Called at most once, and only after consent. */
  load(key: string): Promise<PostHogLike>;
  /** Removes PostHog's cookies and local / session storage entries. */
  clearStorage(): void;
}

export interface Analytics {
  /** Sends an event when analytics are on; otherwise does nothing. */
  track<E extends EventName>(event: E, props: EventProps[E]): void;
  /** Loads PostHog if consent was given earlier (call once the page is up). */
  start(): void;
  /** Records the learner's choice and applies its effects. */
  setConsent(choice: "granted" | "denied"): void;
  /** Analytics would send right now: a key and consent. */
  enabled(): boolean;
}

/** Events queued while posthog-js is still loading; beyond this they are dropped. */
const QUEUE_MAX = 50;

export function createAnalytics(env: AnalyticsEnv): Analytics {
  let instance: PostHogLike | null = null;
  let loading: Promise<PostHogLike | null> | null = null;
  let queue: [string, Record<string, string | number>][] = [];

  const enabled = () => !!env.key && env.readConsent() === "granted";

  function ensureLoaded(): void {
    if (!enabled()) return;
    if (instance) {
      // allowed again after "No thanks" on this page
      try {
        instance.set_config({ ...ACTIVE_CONFIG });
        instance.opt_in_capturing({ captureEventName: false });
      } catch {
        // ignore
      }
      return;
    }
    if (loading) return;
    loading = env
      .load(env.key)
      .then((ph) => {
        instance = ph;
        // consent may have been withdrawn while the script was loading
        if (enabled()) for (const [event, props] of queue) ph.capture(event, props);
        else optOut();
        queue = [];
        return ph;
      })
      .catch(() => {
        // blocked by an extension or offline: analytics are best-effort
        queue = [];
        loading = null;
        return null;
      });
  }

  function optOut(): void {
    queue = [];
    try {
      // reset() first: it returns consent to the default, so opting out must follow it
      instance?.reset();
      instance?.opt_out_capturing();
      // its opt-out flag is cleared below with the rest, so keep the instance silent by config
      instance?.set_config({ ...SILENT_CONFIG });
    } catch {
      // ignore: storage is cleared below either way
    }
    try {
      env.clearStorage();
    } catch {
      // ignore
    }
  }

  return {
    enabled,
    track(event, props) {
      if (!enabled()) return;
      const clean = cleanProps(event, props as Record<string, unknown>);
      if (!clean) return;
      try {
        if (instance) instance.capture(event, clean);
        else {
          if (queue.length < QUEUE_MAX) queue.push([event, clean]);
          ensureLoaded();
        }
      } catch {
        // analytics never break practice
      }
    },
    start() {
      ensureLoaded();
    },
    setConsent(choice) {
      const { consent, effects } = nextConsent(env.readConsent(), choice);
      env.writeConsent(consent);
      if (effects.includes("optOut")) optOut();
      if (effects.includes("load")) ensureLoaded();
    },
  };
}

// ---- browser wiring -------------------------------------------------------------

/** Inlined at build time; unset in development and tests, which turns analytics off. */
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
/** PostHog Cloud EU (Frankfurt). Override only for a reverse proxy. */
export const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
const POSTHOG_UI_HOST = "https://eu.posthog.com";

const listeners = new Set<() => void>();

function readConsentRaw(): Consent {
  try {
    return decodeConsent(window.localStorage.getItem(CONSENT_KEY));
  } catch {
    return null;
  }
}

function writeConsentRaw(consent: Consent): void {
  try {
    if (consent === null) window.localStorage.removeItem(CONSENT_KEY);
    else window.localStorage.setItem(CONSENT_KEY, consent);
  } catch {
    // storage off: the choice lasts for this page only
    memoryConsent = consent;
  }
  listeners.forEach((fn) => fn());
}

/** Used only when localStorage throws, so the banner still goes away. */
let memoryConsent: Consent = null;
const readConsent = (): Consent => readConsentRaw() ?? memoryConsent;

/** Deletes PostHog's `ph_*` cookies and storage entries (its default persistence names). */
function clearPostHogStorage(): void {
  const isPostHog = (name: string) => name.startsWith("ph_") || name.startsWith("__ph_");
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key && isPostHog(key)) keys.push(key);
      }
      keys.forEach((key) => store.removeItem(key));
    } catch {
      // ignore
    }
  }
  const host = window.location.hostname;
  const parts = host.split(".");
  const domains = [""];
  for (let i = 0; i < parts.length - 1; i++) domains.push(`; domain=.${parts.slice(i).join(".")}`);
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0].trim();
    if (!isPostHog(name)) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
    }
  }
}

async function loadPostHog(key: string): Promise<PostHogLike> {
  const { default: posthog } = await import("posthog-js");
  posthog.init(key, {
    api_host: POSTHOG_HOST,
    ui_host: POSTHOG_UI_HOST,
    defaults: "2026-08-30",
    // only the events in EVENT_SCHEMA, plus page views
    autocapture: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    capture_performance: false,
    // the initial page view, then one per client-side navigation (Next's router uses pushState)
    capture_pageview: "history_change",
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    advanced_disable_feature_flags: true,
    person_profiles: "identified_only",
    persistence: "localStorage+cookie",
    respect_dnt: true,
  });
  return posthog as unknown as PostHogLike;
}

const analytics = createAnalytics({
  key: POSTHOG_KEY,
  readConsent,
  writeConsent: writeConsentRaw,
  load: loadPostHog,
  clearStorage: clearPostHogStorage,
});

export const track: Analytics["track"] = (event, props) => analytics.track(event, props);
export const setConsent = (choice: "granted" | "denied") => analytics.setConsent(choice);
export const startAnalytics = () => analytics.start();
export const analyticsEnabled = () => analytics.enabled();

/**
 * Sends goal_met the first time today's goal is met. `compute` is only called
 * when analytics are on, so the progress logic costs nothing otherwise.
 */
export function trackGoal(compute: () => Omit<GoalCheck, "lastSent">): void {
  if (!analytics.enabled()) return;
  try {
    let lastSent: string | null = null;
    try {
      lastSent = window.localStorage.getItem(GOAL_SENT_KEY);
    } catch {
      // ignore
    }
    const check = { ...compute(), lastSent };
    const props = goalMetProps(check);
    if (!props) return;
    try {
      window.localStorage.setItem(GOAL_SENT_KEY, check.today);
    } catch {
      // ignore
    }
    track("goal_met", props);
  } catch {
    // never break practice
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The learner's choice, live; undefined on the server and during hydration. */
export const useConsent = (): Consent | undefined =>
  useSyncExternalStore<Consent | undefined>(subscribe, readConsent, () => undefined);
