import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { replay, type AnswerEvent } from "../progress";
import {
  LOG_KEY,
  OUTBOX_KEY,
  PROGRESS_KEY,
  readOutbox,
  readProfile,
  readProgress,
  readSettings,
  readSyncState,
  saveProfile,
  saveSettings,
  startAccountState,
} from "../storage";
import { isEmptyBase, mergeLogs, resetSyncForTests, startAutoSync, syncNow } from "../sync";
import { FakeServer, installWindow, MemoryStorage } from "./fakeBrowser";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1, 9);

function ev(i: number, card = `cases:kot|gen|${i % 3}`, verdict: AnswerEvent["verdict"] = "correct"): AnswerEvent {
  const t = T0 + i * 3_600_000;
  return {
    t,
    day: new Date(t).toISOString().slice(0, 10),
    card,
    skill: card.replace(/kot\|/, ""),
    verdict: i % 4 === 0 ? "wrong" : verdict,
    ...(i % 4 === 0 ? { miss: "ending" as const } : {}),
    drill: "cases",
    case: "gen",
  };
}

const EVENTS = Array.from({ length: 40 }, (_, i) => ev(i));

/** A deterministic shuffle. */
function shuffled<T>(xs: T[], seed: number): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe("mergeLogs", () => {
  it("is the union by (t, card), sorted by t then card", () => {
    const a = ev(1, "cases:a");
    const b = { ...ev(1, "cases:b") };
    const c = ev(2);
    expect(mergeLogs([c, b], [a, c, b])).toEqual([a, b, c]);
  });

  it("same events in any order and with duplicates → identical Progress", () => {
    const expected = replay(mergeLogs(EVENTS, []));
    for (const seed of [1, 2, 3, 4, 5]) {
      const mixed = shuffled([...EVENTS, ...EVENTS.slice(0, 15)], seed);
      const split = seed * 5;
      const merged = mergeLogs(mixed.slice(0, split), mixed.slice(split));
      expect(merged).toEqual(EVENTS);
      expect(replay(merged)).toEqual(expected);
    }
  });

  it("with a base: same events in any order → identical Progress", () => {
    const base = replay(EVENTS.slice(0, 5));
    const expected = replay(EVENTS.slice(5), base);
    expect(replay(mergeLogs(shuffled(EVENTS.slice(5), 9), shuffled(EVENTS.slice(10), 3)), base)).toEqual(expected);
  });
});

describe("isEmptyBase", () => {
  it("treats migrateV1's empty base as nothing to upload", () => {
    expect(isEmptyBase(undefined)).toBe(true);
    expect(isEmptyBase({ v: 2, cards: {}, skills: {}, days: {}, cases: {}, migrated: true })).toBe(true);
    expect(isEmptyBase({ v: 2, cards: {}, skills: {}, days: {}, cases: { cases: { gen: { correct: 1, total: 2 } } } })).toBe(false);
  });
});

describe("syncNow", () => {
  let server: FakeServer;
  const account = { token: "tok-1", email: "a@b.co", user: null, entitlement: null };

  /** A device: its own storage, with `log` already answered locally. */
  function device(log: AnswerEvent[] = []): MemoryStorage {
    const storage = installWindow();
    storage.setItem(LOG_KEY, JSON.stringify(log));
    return storage;
  }
  const onDevice = (storage: MemoryStorage) => installWindow(storage);

  beforeEach(() => {
    server = new FakeServer();
    vi.stubGlobal("fetch", server.fetch);
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/");
    resetSyncForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is skipped when accounts are off or signed out", async () => {
    device(EVENTS);
    expect(await syncNow({ force: true })).toBe("skipped");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    startAccountState(account);
    expect(await syncNow({ force: true })).toBe("skipped");
    expect(server.requests).toEqual([]);
    expect(startAutoSync()).toBeTypeOf("function");
  });

  it("first sign-in uploads the whole log and clears the outbox", async () => {
    const a = device(EVENTS);
    onDevice(a);
    startAccountState(account);
    expect(readOutbox()).toHaveLength(EVENTS.length);
    expect(await syncNow({ force: true })).toBe("ok");
    expect(server.rows).toHaveLength(EVENTS.length);
    expect(a.getItem(OUTBOX_KEY)).toBeNull();
    expect(readSyncState().cursor).toBe(EVENTS.length);
    expect(server.requests[0].auth).toBe("Bearer tok-1");
    expect(server.requests[0].body).toMatchObject({ cursor: 0 });
  });

  it("two devices converge on the same log and Progress", async () => {
    const a = device(EVENTS.slice(0, 20));
    const b = device(EVENTS.slice(15));
    onDevice(a);
    startAccountState(account);
    await syncNow({ force: true });
    onDevice(b);
    startAccountState(account);
    await syncNow({ force: true });
    onDevice(a);
    await syncNow({ force: true });

    const logA = JSON.parse(a.getItem(LOG_KEY)!);
    const logB = JSON.parse(b.getItem(LOG_KEY)!);
    expect(logA).toEqual(EVENTS);
    expect(logB).toEqual(EVENTS);
    const progressA = JSON.parse(a.getItem(PROGRESS_KEY)!);
    const progressB = JSON.parse(b.getItem(PROGRESS_KEY)!);
    expect(progressA.cards).toEqual(replay(EVENTS).cards);
    expect({ ...progressA, base: undefined }).toEqual({ ...progressB, base: undefined });
    expect(server.rows).toHaveLength(EVENTS.length);
  });

  it("pages while `more`, and keeps pushing until the outbox is empty", async () => {
    server.maxPull = 7;
    for (const e of EVENTS) server.sync({ cursor: 0, events: [e] });
    const b = device();
    onDevice(b);
    startAccountState(account);
    expect(await syncNow({ force: true })).toBe("ok");
    expect(JSON.parse(b.getItem(LOG_KEY)!)).toEqual(EVENTS);
    expect(readSyncState().cursor).toBe(EVENTS.length);
    expect(server.requests.length).toBe(Math.ceil(EVENTS.length / 7));
  });

  it("clears exactly the pushed events: one answered during the request stays", async () => {
    const a = device(EVENTS.slice(0, 3));
    onDevice(a);
    startAccountState(account);
    const late = ev(99);
    const realFetch = server.fetch;
    let once = true;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (once) {
        once = false;
        // an answer lands while the first request is in flight
        a.setItem(OUTBOX_KEY, JSON.stringify([...JSON.parse(a.getItem(OUTBOX_KEY)!), late]));
      }
      return realFetch(url, init);
    });
    expect(await syncNow({ force: true })).toBe("ok");
    // the loop went on for it, since the outbox was not empty
    expect(server.rows.map((r) => r.event)).toContainEqual(late);
    expect(readOutbox()).toEqual([]);
  });

  it("keeps the outbox when offline or on a server error", async () => {
    const a = device(EVENTS.slice(0, 3));
    onDevice(a);
    startAccountState(account);
    server.offline = true;
    expect(await syncNow({ force: true })).toBe("offline");
    expect(readOutbox()).toHaveLength(3);
    server.offline = false;
    server.failures.push({ status: 500, body: { error: "internal" } });
    expect(await syncNow({ force: true })).toBe("error");
    expect(readOutbox()).toHaveLength(3);
    expect(await syncNow({ force: true })).toBe("ok");
    expect(readOutbox()).toHaveLength(0);
  });

  it("a 401 signs out and keeps the local log", async () => {
    const a = device(EVENTS.slice(0, 3));
    onDevice(a);
    startAccountState(account);
    server.failures.push({ status: 401, body: { error: "unauthorized" } });
    expect(await syncNow({ force: true })).toBe("error");
    expect(a.getItem("polish.account.v1")).toBeNull();
    expect(a.getItem(OUTBOX_KEY)).toBeNull();
    expect(JSON.parse(a.getItem(LOG_KEY)!)).toHaveLength(3);
  });

  it("throttles to one sync per 30 s unless forced", async () => {
    onDevice(device());
    startAccountState(account);
    expect(await syncNow()).toBe("ok");
    expect(await syncNow()).toBe("skipped");
    expect(await syncNow({ force: true })).toBe("ok");
  });

  it("settings and profile: last write wins; an unstamped local value loses", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(T0);
      const a = device();
      onDevice(a);
      saveSettings({ goal: 40, newPerDay: 5 });
      saveProfile({ name: "Ania" });
      startAccountState(account);
      await syncNow({ force: true });
      expect(server.settings).toEqual({ value: { goal: 40, newPerDay: 5 }, updatedAt: T0 });
      expect(server.profile?.value).toEqual({ name: "Ania" });

      // a second device with older local values that were never stamped
      const b = device();
      onDevice(b);
      b.setItem("polish.settings.v2", JSON.stringify({ goal: 10, newPerDay: 3 }));
      b.setItem("polish.profile.v1", JSON.stringify({ name: "Old" }));
      startAccountState(account);
      await syncNow({ force: true });
      expect(readSettings()).toEqual({ goal: 40, newPerDay: 5 });
      expect(readProfile()).toEqual({ name: "Ania" });

      // b changes the goal later: it reaches a
      vi.setSystemTime(T0 + DAY);
      saveSettings({ goal: 20, newPerDay: 5 });
      await syncNow({ force: true });
      onDevice(a);
      await syncNow({ force: true });
      expect(readSettings()).toEqual({ goal: 20, newPerDay: 5 });
      expect(readSyncState().settingsAt).toBe(T0 + DAY);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a learner with no progress at sign-in gets no merged notice, even after answering", async () => {
    const a = device([]);
    onDevice(a);
    startAccountState(account);
    await syncNow({ force: true });
    expect(readSyncState()).toMatchObject({ cursor: 0, joined: true });
    expect(readSyncState().merged).toBeUndefined();
    a.setItem(OUTBOX_KEY, JSON.stringify(EVENTS.slice(0, 1)));
    await syncNow({ force: true });
    expect(readSyncState().merged).toBeUndefined();
  });

  it("first sync: uploads a real base, and a second device replays from the account's base", async () => {
    const baseProgress = replay(EVENTS.slice(0, 5));
    const ownBase = { ...baseProgress, migrated: true };
    const a = device(EVENTS.slice(5, 10));
    a.setItem(PROGRESS_KEY, JSON.stringify({ ...replay(EVENTS.slice(5, 10), ownBase), migrated: true }));
    onDevice(a);
    startAccountState(account);
    await syncNow({ force: true });
    expect(server.base).toEqual(ownBase);
    expect(readSyncState().merged).toBe(true);

    // device b had other v1 counts: they are dropped, the account's base wins
    const otherBase = { v: 2, cards: {}, skills: {}, days: {}, cases: { cases: { acc: { correct: 9, total: 9 } } }, migrated: true };
    const b = device([]);
    b.setItem(PROGRESS_KEY, JSON.stringify({ ...otherBase, base: otherBase }));
    onDevice(b);
    startAccountState(account);
    await syncNow({ force: true });
    expect(server.base).toEqual(ownBase);
    const progress = readProgress();
    expect(progress.base).toEqual(ownBase);
    expect(progress.cards).toEqual(replay(EVENTS.slice(5, 10), ownBase).cards);
    expect(progress.cases.cases?.acc).toBeUndefined();
    expect(progress.migrated).toBe(true);
  });

  it("ignores malformed pulled events", async () => {
    server.rows.push({ seq: ++server.seq, userId: "u1", event: { t: "x" } as never });
    server.rows.push({ seq: ++server.seq, userId: "u1", event: EVENTS[0] });
    const a = device();
    onDevice(a);
    startAccountState(account);
    expect(await syncNow({ force: true })).toBe("ok");
    expect(JSON.parse(a.getItem(LOG_KEY)!)).toEqual([EVENTS[0]]);
  });
});
