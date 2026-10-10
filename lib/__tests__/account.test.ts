import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Entitlement, WireEvent, WireSettings, WireProfile, WireBase } from "../../workers/api/src/contract";
import { OFFLINE_GRACE_MS as WIRE_GRACE } from "../../workers/api/src/contract";
import {
  ApiFailure,
  apiEnabled,
  deleteAccount,
  fetchMe,
  getConfig,
  hasAccess,
  OFFLINE_GRACE_MS,
  readAccount,
  readPublicConfig,
  signOut,
  startSignIn,
  verifyCode,
} from "../account";
import { compact, replay, type AnswerEvent, type Progress, type Settings } from "../progress";
import {
  ACCOUNT_KEY,
  LOG_KEY,
  OUTBOX_KEY,
  outboxSafeKeep,
  readOutbox,
  readStoredAccount,
  readSyncState,
  recordAnswer,
  saveProfile,
  saveSettings,
  startAccountState,
  SYNC_KEY,
} from "../storage";
import type { Profile } from "../storage";
import { resetSyncForTests } from "../sync";
import type { Exercise } from "../types";
import { FakeServer, installWindow, MemoryStorage } from "./fakeBrowser";

// ---- type-level: the app's types fit the wire types (plans/phase-4.md §4) ----
expectTypeOf<AnswerEvent>().toExtend<WireEvent>();
expectTypeOf<Settings>().toExtend<WireSettings>();
expectTypeOf<Profile>().toExtend<WireProfile>();
expectTypeOf<NonNullable<Progress["base"]>>().toExtend<WireBase>();
// checked by tsc too, not only by vitest's type helpers
const _event: WireEvent = {} as AnswerEvent;
const _settings: WireSettings = {} as Settings;
void _event;
void _settings;

const DAY = 86_400_000;
const ent = (patch: Partial<Entitlement>): Entitlement => ({
  status: "active",
  plan: "monthly",
  access: true,
  until: null,
  trialEnd: null,
  trialUsed: true,
  checkedAt: 0,
  ...patch,
});

describe("hasAccess (offline rule, §5)", () => {
  it("uses the contract's grace", () => expect(OFFLINE_GRACE_MS).toBe(WIRE_GRACE));

  it("no entitlement or no access → no", () => {
    expect(hasAccess(null, 0)).toBe(false);
    expect(hasAccess(ent({ access: false, status: "none" }), 0)).toBe(false);
  });

  it("beta and Lifetime: for ever", () => {
    expect(hasAccess(ent({ status: "beta", plan: "beta", until: null }), 1e15)).toBe(true);
    expect(hasAccess(ent({ status: "lifetime", plan: "lifetime", until: null }), 1e15)).toBe(true);
  });

  it("a subscription: until the period end, or 7 days after the last check if later", () => {
    const e = ent({ until: 30 * DAY, checkedAt: 0 });
    expect(hasAccess(e, 30 * DAY - 1)).toBe(true);
    expect(hasAccess(e, 30 * DAY)).toBe(false);
    const late = ent({ until: 2 * DAY, checkedAt: DAY });
    expect(hasAccess(late, 8 * DAY - 1)).toBe(true);
    expect(hasAccess(late, 8 * DAY)).toBe(false);
  });
});

const exercise = (card: string): Exercise =>
  ({ id: card, case: "gen", number: "sg", card, skill: "cases:gen|sg", kind: "cases" }) as unknown as Exercise;

describe("storage while signed in", () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = installWindow();
  });

  it("signed out: recordAnswer writes no outbox (as before accounts)", () => {
    recordAnswer(exercise("cases:kot|gen|sg"), "cases", "correct", "kota");
    expect(JSON.parse(storage.getItem(LOG_KEY)!)).toHaveLength(1);
    expect(storage.getItem(OUTBOX_KEY)).toBeNull();
    expect(storage.getItem(SYNC_KEY)).toBeNull();
  });

  it("signed in: each answer goes to the log and the outbox", () => {
    recordAnswer(exercise("cases:kot|gen|sg"), "cases", "correct", "kota");
    startAccountState({ token: "t", email: "a@b.co", user: null, entitlement: null });
    expect(readOutbox()).toHaveLength(1); // the outbox starts as the whole log
    recordAnswer(exercise("cases:pies|gen|sg"), "cases", "correct", "psa");
    const log = JSON.parse(storage.getItem(LOG_KEY)!);
    expect(log).toHaveLength(2);
    expect(readOutbox()).toEqual(log);
  });

  it("saveSettings and saveProfile stamp polish.sync.v1, keeping the keys' own format", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(1234);
      saveSettings({ goal: 40, newPerDay: 5 });
      vi.setSystemTime(5678);
      saveProfile({ name: "Ania" });
      expect(readSyncState()).toMatchObject({ settingsAt: 1234, profileAt: 5678 });
      expect(JSON.parse(storage.getItem("polish.settings.v2")!)).toEqual({ goal: 40, newPerDay: 5 });
      expect(JSON.parse(storage.getItem("polish.profile.v1")!)).toEqual({ name: "Ania" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("compaction never folds outbox events (§6.5)", () => {
  const events: AnswerEvent[] = Array.from({ length: 30 }, (_, i) => ({
    t: 1000 + i,
    day: "2026-10-01",
    card: `cases:c${i}`,
    skill: "cases:gen|sg",
    verdict: "correct",
    drill: "cases",
    case: "gen",
  }));

  it("keeps at least `keep`, and everything from the oldest outbox event on", () => {
    expect(outboxSafeKeep(events, [], 10)).toBe(10);
    expect(outboxSafeKeep(events, events.slice(25), 10)).toBe(10);
    expect(outboxSafeKeep(events, events.slice(5), 10)).toBe(25);
    expect(outboxSafeKeep(events, [events[29], events[3]], 10)).toBe(27);
  });

  it("the outbox events stay in the log after compact", () => {
    const outbox = events.slice(8);
    const progress = replay(events);
    const kept = compact(progress, events, outboxSafeKeep(events, outbox, 5));
    expect(kept.events).toEqual(outbox);
    expect(replay(kept.events, kept.progress.base)).toEqual({ ...progress, base: kept.progress.base });
  });
});

describe("API client", () => {
  let server: FakeServer;
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = installWindow();
    server = new FakeServer();
    vi.stubGlobal("fetch", server.fetch);
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
    resetSyncForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is off without NEXT_PUBLIC_API_URL", async () => {
    expect(apiEnabled()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    expect(apiEnabled()).toBe(false);
    await expect(getConfig()).rejects.toMatchObject({ code: "network" });
    expect(server.requests).toEqual([]);
  });

  it("caches /config", async () => {
    expect(readPublicConfig()).toBeNull();
    await getConfig();
    expect(readPublicConfig()).toEqual({ betaOpen: true, lifetimeOfferUntil: null, currency: "eur" });
    expect(server.requests[0].path).toBe("/config");
  });

  it("verifyCode saves the token and entitlement, and fetchMe refreshes them", async () => {
    storage.setItem(LOG_KEY, JSON.stringify([]));
    const res = await verifyCode(" A@b.co ", " 123456 ", true);
    expect(server.requests[0].body).toEqual({ email: "A@b.co", code: "123456", marketingConsent: true });
    expect(res.isNew).toBe(true);
    const account = readAccount();
    expect(account?.token).toBe("tok-1");
    expect(account?.entitlement?.status).toBe("beta");
    await fetchMe();
    expect(readAccount()?.entitlement?.checkedAt).toBe(2);
    expect(readAccount()?.config?.currency).toBe("pln");
    expect(server.requests.some((r) => r.path === "/me" && r.auth === "Bearer tok-1")).toBe(true);
  });

  it("typed errors: attemptsLeft, retryAfter, network", async () => {
    server.failures.push({ status: 400, body: { error: "invalid_code", message: "Wrong code", attemptsLeft: 3 } });
    const wrong = await verifyCode("a@b.co", "000000", false).catch((e) => e);
    expect(wrong).toBeInstanceOf(ApiFailure);
    expect(wrong).toMatchObject({ code: "invalid_code", status: 400, attemptsLeft: 3, message: "Wrong code" });
    expect(readStoredAccount()).toBeNull();

    server.failures.push({ status: 429, body: { error: "rate_limited", retryAfter: 42 } });
    await expect(startSignIn("a@b.co")).rejects.toMatchObject({ code: "rate_limited", retryAfter: 42 });

    server.failures.push({ status: 502, body: "<html>" });
    await expect(startSignIn("a@b.co")).rejects.toMatchObject({ code: "internal", status: 502 });

    server.offline = true;
    await expect(startSignIn("a@b.co")).rejects.toMatchObject({ code: "network", status: 0 });
  });

  it("a 401 drops the token and keeps the local data", async () => {
    storage.setItem(LOG_KEY, JSON.stringify([{ t: 1, card: "x" }]));
    startAccountState({ token: "tok-1", email: "a@b.co", user: null, entitlement: ent({}) });
    server.failures.push({ status: 401, body: { error: "unauthorized" } });
    await expect(fetchMe()).rejects.toMatchObject({ code: "unauthorized" });
    expect(storage.getItem(ACCOUNT_KEY)).toBeNull();
    expect(storage.getItem(OUTBOX_KEY)).toBeNull();
    expect(storage.getItem(LOG_KEY)).not.toBeNull();
  });

  it("signOut clears token, outbox, cursor and entitlement, and keeps progress and stamps", async () => {
    saveSettings({ goal: 40, newPerDay: 5 });
    storage.setItem(LOG_KEY, JSON.stringify([{ t: 1, card: "x" }]));
    startAccountState({ token: "tok-1", email: "a@b.co", user: null, entitlement: ent({}) });
    storage.setItem(SYNC_KEY, JSON.stringify({ ...readSyncState(), cursor: 9, settingsSynced: 5 }));
    await signOut();
    expect(server.requests.at(-1)?.path).toBe("/auth/signout");
    expect(readAccount()).toBeNull();
    expect(storage.getItem(OUTBOX_KEY)).toBeNull();
    const sync = readSyncState();
    expect(sync.cursor).toBe(0);
    expect(sync.settingsSynced).toBeUndefined();
    expect(sync.settingsAt).toBeGreaterThan(0);
    expect(storage.getItem(LOG_KEY)).not.toBeNull();
    expect(storage.getItem("polish.settings.v2")).not.toBeNull();
  });

  it("signOut works offline", async () => {
    startAccountState({ token: "tok-1", email: "a@b.co", user: null, entitlement: null });
    server.offline = true;
    await signOut();
    expect(readAccount()).toBeNull();
  });

  it("deleteAccount signs out after the server deleted", async () => {
    startAccountState({ token: "tok-1", email: "a@b.co", user: null, entitlement: null });
    server.failures.push({ status: 502, body: { error: "stripe_error" } });
    await expect(deleteAccount()).rejects.toMatchObject({ code: "stripe_error" });
    expect(readAccount()).not.toBeNull();
    server.failures.push({ status: 200, body: { ok: true } });
    await deleteAccount();
    expect(readAccount()).toBeNull();
  });
});
