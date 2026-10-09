import { describe, expect, it, vi } from "vitest";
import {
  ACTIVE_CONFIG,
  cleanProps,
  createAnalytics,
  decodeConsent,
  EVENT_SCHEMA,
  goalMetProps,
  nextConsent,
  POSTHOG_KEY,
  shouldAsk,
  SILENT_CONFIG,
  track,
  type AnalyticsEnv,
  type Consent,
  type PostHogLike,
} from "../analytics";

function fakePostHog() {
  return {
    capture: vi.fn(),
    opt_out_capturing: vi.fn(),
    opt_in_capturing: vi.fn(),
    reset: vi.fn(),
    set_config: vi.fn(),
  } satisfies PostHogLike;
}

function setup(key: string, initial: Consent = null) {
  let consent: Consent = initial;
  const ph = fakePostHog();
  const env = {
    key,
    readConsent: () => consent,
    writeConsent: vi.fn((c: Consent) => {
      consent = c;
    }),
    load: vi.fn(async () => ph),
    clearStorage: vi.fn(),
  } satisfies AnalyticsEnv;
  return { analytics: createAnalytics(env), env, ph, consent: () => consent };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("consent", () => {
  it("decodes only the two stored values", () => {
    expect(decodeConsent("granted")).toBe("granted");
    expect(decodeConsent("denied")).toBe("denied");
    expect(decodeConsent(null)).toBeNull();
    expect(decodeConsent(undefined)).toBeNull();
    expect(decodeConsent("yes")).toBeNull();
  });

  it("is a state machine: allow loads, deny after allow opts out, repeats do nothing", () => {
    expect(nextConsent(null, "granted")).toEqual({ consent: "granted", effects: ["load"] });
    expect(nextConsent(null, "denied")).toEqual({ consent: "denied", effects: [] });
    expect(nextConsent("granted", "denied")).toEqual({ consent: "denied", effects: ["optOut"] });
    expect(nextConsent("denied", "granted")).toEqual({ consent: "granted", effects: ["load"] });
    expect(nextConsent("granted", "granted")).toEqual({ consent: "granted", effects: [] });
    expect(nextConsent("denied", "denied")).toEqual({ consent: "denied", effects: [] });
  });

  it("asks only with a key, after hydration, before any choice", () => {
    expect(shouldAsk(true, null)).toBe(true);
    expect(shouldAsk(false, null)).toBe(false);
    expect(shouldAsk(true, undefined)).toBe(false);
    expect(shouldAsk(true, "granted")).toBe(false);
    expect(shouldAsk(true, "denied")).toBe(false);
  });
});

describe("track", () => {
  it("is off in tests: no key is configured", () => {
    expect(POSTHOG_KEY).toBe("");
    expect(() => track("answer", { drill: "cases", verdict: "correct" })).not.toThrow();
  });

  it("does nothing without a key, even with consent", async () => {
    const { analytics, env } = setup("", "granted");
    analytics.start();
    analytics.track("answer", { drill: "cases", verdict: "correct" });
    analytics.setConsent("granted");
    await flush();
    expect(env.load).not.toHaveBeenCalled();
    expect(analytics.enabled()).toBe(false);
  });

  it("does nothing with a key before consent or after No thanks", async () => {
    for (const consent of [null, "denied"] as const) {
      const { analytics, env } = setup("phc_test", consent);
      analytics.start();
      analytics.track("answer", { drill: "cases", verdict: "correct" });
      await flush();
      expect(env.load).not.toHaveBeenCalled();
    }
    const { analytics, env } = setup("phc_test", null);
    analytics.setConsent("denied");
    analytics.track("pwa_installed", {});
    await flush();
    expect(env.load).not.toHaveBeenCalled();
    expect(env.clearStorage).not.toHaveBeenCalled();
  });

  it("loads PostHog once after consent and sends queued events", async () => {
    const { analytics, env, ph } = setup("phc_test", null);
    analytics.setConsent("granted");
    analytics.track("session_started", { source: "today", drill: "shuffle", size: 20 });
    analytics.track("answer", { drill: "verbs", verdict: "diacritics" });
    await flush();
    analytics.track("session_finished", { source: "today", size: 20, correct: 17 });
    expect(env.load).toHaveBeenCalledTimes(1);
    expect(env.load).toHaveBeenCalledWith("phc_test");
    expect(ph.capture.mock.calls).toEqual([
      ["session_started", { source: "today", drill: "shuffle", size: 20 }],
      ["answer", { drill: "verbs", verdict: "diacritics" }],
      ["session_finished", { source: "today", size: 20, correct: 17 }],
    ]);
  });

  it("starts on a later visit when consent was given before", async () => {
    const { analytics, env } = setup("phc_test", "granted");
    analytics.start();
    await flush();
    expect(env.load).toHaveBeenCalledTimes(1);
  });

  it("denying after granting opts out, resets, silences and clears storage", async () => {
    const { analytics, env, ph, consent } = setup("phc_test", "granted");
    analytics.start();
    await flush();
    analytics.setConsent("denied");
    expect(consent()).toBe("denied");
    expect(ph.reset).toHaveBeenCalled();
    expect(ph.opt_out_capturing).toHaveBeenCalled();
    // reset() restores the default consent, so the opt-out must come after it
    expect(ph.reset.mock.invocationCallOrder[0]).toBeLessThan(ph.opt_out_capturing.mock.invocationCallOrder[0]);
    expect(ph.set_config).toHaveBeenCalledWith(SILENT_CONFIG);
    expect(env.clearStorage).toHaveBeenCalled();
    analytics.track("answer", { drill: "cases", verdict: "wrong" });
    expect(ph.capture).not.toHaveBeenCalled();

    analytics.setConsent("granted");
    expect(ph.set_config).toHaveBeenLastCalledWith(ACTIVE_CONFIG);
    expect(ph.opt_in_capturing).toHaveBeenCalled();
    expect(env.load).toHaveBeenCalledTimes(1);
  });

  it("drops the queue when consent is withdrawn while PostHog loads", async () => {
    const { analytics, ph, env } = setup("phc_test", null);
    analytics.setConsent("granted");
    analytics.track("pwa_installed", {});
    analytics.setConsent("denied");
    await flush();
    expect(ph.capture).not.toHaveBeenCalled();
    expect(ph.opt_out_capturing).toHaveBeenCalled();
    expect(env.clearStorage).toHaveBeenCalled();
  });

  it("survives PostHog failing to load", async () => {
    const { analytics, env } = setup("phc_test", "granted");
    env.load.mockRejectedValueOnce(new Error("blocked"));
    analytics.track("pwa_installed", {});
    await flush();
    expect(() => analytics.track("pwa_installed", {})).not.toThrow();
    expect(env.load).toHaveBeenCalledTimes(2);
  });
});

describe("event props carry no free text", () => {
  it("keeps schema props with valid values", () => {
    expect(cleanProps("answer", { drill: "numbers", verdict: "wrong" })).toEqual({ drill: "numbers", verdict: "wrong" });
    expect(cleanProps("goal_met", { goal: 20, streak: 3 })).toEqual({ goal: 20, streak: 3 });
    expect(cleanProps("pwa_installed", {})).toEqual({});
  });

  it("drops unknown props, free text and odd numbers", () => {
    expect(
      cleanProps("answer", {
        drill: "Kocham mojego psa",
        verdict: "correct",
        answer: "psa",
        input: "psem",
        email: "a@b.c",
      }),
    ).toEqual({ verdict: "correct" });
    expect(cleanProps("session_finished", { source: "today", size: 1.5, correct: -1 })).toEqual({ source: "today" });
    expect(cleanProps("session_started", { source: "home", drill: "cases", size: "20" })).toEqual({ drill: "cases" });
    expect(cleanProps("pwa_installed", { note: "hello" })).toEqual({});
    expect(cleanProps("whatever", { a: 1 })).toBeNull();
  });

  it("never sends a string that is not an enum value", async () => {
    const { analytics, ph } = setup("phc_test", "granted");
    analytics.start();
    await flush();
    const sneaky = { drill: "cases", verdict: "correct", text: "Mam dwa koty" } as unknown as {
      drill: "cases";
      verdict: "correct";
    };
    analytics.track("answer", sneaky);
    analytics.track("unknown" as "pwa_installed", {});
    expect(ph.capture.mock.calls).toEqual([["answer", { drill: "cases", verdict: "correct" }]]);
  });

  it("schema props are only enums and counts", () => {
    for (const [event, schema] of Object.entries(EVENT_SCHEMA)) {
      for (const check of Object.values(schema as Record<string, (v: unknown) => boolean>)) {
        expect(check("any free text"), event).toBe(false);
      }
    }
  });
});

describe("goal_met", () => {
  const base = { answered: 20, goal: 20, streak: 4, today: "2026-10-09", lastSent: null };

  it("fires once the goal is met", () => {
    expect(goalMetProps(base)).toEqual({ goal: 20, streak: 4 });
    expect(goalMetProps({ ...base, lastSent: "2026-10-08" })).toEqual({ goal: 20, streak: 4 });
  });

  it("not before the goal, and not twice a day", () => {
    expect(goalMetProps({ ...base, answered: 19 })).toBeNull();
    expect(goalMetProps({ ...base, lastSent: "2026-10-09" })).toBeNull();
  });
});
