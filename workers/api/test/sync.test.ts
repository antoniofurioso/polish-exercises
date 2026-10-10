import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYNC_MAX_PULL, SYNC_MAX_PUSH, type SyncResponse, type WireEvent } from "../src/contract";
import { readBody } from "../src/http";
import { MAX_CLOCK_AHEAD_MS, isWireEvent } from "../src/sync";
import { sqliteOf } from "./d1";
import { type Harness, harness, signIn } from "./helpers";

vi.mock("../src/list", () => ({ syncContact: vi.fn(async () => {}), removeContact: vi.fn(async () => {}) }));
vi.mock("../src/billing", () => ({
  billingRoutes: {},
  deleteBillingFor: vi.fn(async () => {}),
  runBillingCron: vi.fn(async () => {}),
}));

let h: Harness;
let token: string;

beforeEach(async () => {
  h = harness();
  ({ token } = await signIn(h));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ev = (t: number, card = "cases:kot|gen|sg", extra: Partial<WireEvent> = {}): WireEvent => ({
  t,
  day: "2026-10-10",
  card,
  skill: "cases:gen|sg",
  verdict: "correct",
  drill: "cases",
  case: "gen",
  ...extra,
});

async function sync(body: Record<string, unknown>, tok = token) {
  const res = await h.call("POST", "/sync", { token: tok, body: { cursor: 0, events: [], ...body } });
  return { status: res.status, body: (await res.json()) as SyncResponse & { error?: string } };
}

describe("event validation", () => {
  it("accepts AnswerEvents, with or without miss, and extra fields (dropped when stored)", () => {
    expect(isWireEvent(ev(1))).toBe(true);
    expect(isWireEvent({ ...ev(1), verdict: "wrong", miss: "ending" })).toBe(true);
    expect(isWireEvent({ ...ev(1), future: 1 })).toBe(true);
  });
  it.each([
    ["t", { t: -1 }],
    ["t float", { t: 1.5 }],
    ["day", { day: "10/10/2026" }],
    ["card", { card: "" }],
    ["skill", { skill: 3 }],
    ["verdict", { verdict: "great" }],
    ["drill", { drill: "shuffle" }],
    ["case", { case: "xyz" }],
    ["miss", { miss: "<script>" }],
  ])("rejects a bad %s", (_n, bad) => {
    expect(isWireEvent({ ...ev(1), ...bad })).toBe(false);
  });
});

describe("POST /sync", () => {
  it("needs a session", async () => {
    expect((await h.call("POST", "/sync", { body: { cursor: 0, events: [] } })).status).toBe(401);
  });

  it("stores events and returns them after the cursor, including the pushed ones", async () => {
    const r = await sync({ events: [ev(1), ev(2, "cases:dom|loc|sg", { verdict: "wrong", miss: "case", extra: "x" } as never)] });
    expect(r.status).toBe(200);
    expect(r.body.events).toHaveLength(2);
    expect(r.body.events[1]).toEqual({ ...ev(2, "cases:dom|loc|sg"), verdict: "wrong", miss: "case" });
    expect(r.body.events[1]).not.toHaveProperty("extra");
    expect(r.body.more).toBe(false);
    expect(r.body.cursor).toBeGreaterThan(0);
    expect(r.body).toMatchObject({ settings: null, profile: null, base: null });
    const again = await sync({ cursor: r.body.cursor });
    expect(again.body.events).toEqual([]);
    expect(again.body.cursor).toBe(r.body.cursor);
    expect(sqliteOf(h.env.DB).prepare("SELECT first_sync_at FROM users").get()!.first_sync_at).not.toBeNull();
  });

  it("a resent event is a no-op (key t + card)", async () => {
    const first = await sync({ events: [ev(1), ev(2)] });
    const second = await sync({ cursor: first.body.cursor, events: [ev(1), ev(2), ev(3)] });
    expect(second.body.events.map((e) => e.t)).toEqual([3]);
    expect(sqliteOf(h.env.DB).prepare("SELECT COUNT(*) AS n FROM events").get()).toEqual({ n: 3 });
  });

  it("keeps users apart", async () => {
    await sync({ events: [ev(1)] });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    const other = await signIn(h, "other@b.pl");
    const r = await sync({ events: [ev(1)] }, other.token);
    expect(r.body.events).toHaveLength(1);
    expect(sqliteOf(h.env.DB).prepare("SELECT COUNT(*) AS n FROM events").get()).toEqual({ n: 2 });
  });

  it("pages the pull at SYNC_MAX_PULL with more", async () => {
    const total = SYNC_MAX_PULL + 300;
    for (let i = 0; i < total; i += SYNC_MAX_PUSH) {
      const batch = Array.from({ length: Math.min(SYNC_MAX_PUSH, total - i) }, (_, k) => ev(i + k + 1));
      expect((await sync({ events: batch, cursor: 1e9 })).status).toBe(200);
    }
    const page1 = await sync({});
    expect(page1.body.events).toHaveLength(SYNC_MAX_PULL);
    expect(page1.body.more).toBe(true);
    expect(page1.body.events[0].t).toBe(1);
    const page2 = await sync({ cursor: page1.body.cursor });
    expect(page2.body.events).toHaveLength(300);
    expect(page2.body.events[0].t).toBe(SYNC_MAX_PULL + 1);
    expect(page2.body.more).toBe(false);
  });

  it("settings and profile: last write wins by updatedAt (1 = never stamped)", async () => {
    const a = await sync({ settings: { value: { goal: 20, newPerDay: 10 }, updatedAt: 100 } });
    expect(a.body.settings).toEqual({ value: { goal: 20, newPerDay: 10 }, updatedAt: 100 });
    const older = await sync({ settings: { value: { goal: 40, newPerDay: 5 }, updatedAt: 1 } });
    expect(older.body.settings).toEqual({ value: { goal: 20, newPerDay: 10 }, updatedAt: 100 });
    const newer = await sync({ settings: { value: { goal: 40, newPerDay: 5 }, updatedAt: 200 } });
    expect(newer.body.settings).toEqual({ value: { goal: 40, newPerDay: 5 }, updatedAt: 200 });

    const p = await sync({ profile: { value: { name: "Ola" }, updatedAt: 1 } });
    expect(p.body.profile).toEqual({ value: { name: "Ola" }, updatedAt: 1 });
    const p2 = await sync({ profile: { value: { name: "Aleksandra" }, updatedAt: 5 } });
    expect(p2.body.profile).toEqual({ value: { name: "Aleksandra" }, updatedAt: 5 });
    // returned on every sync
    expect((await sync({})).body).toMatchObject({ settings: { updatedAt: 200 }, profile: { updatedAt: 5 } });
  });

  it("stores the base only if the server has none (first device wins)", async () => {
    const base = (cards: Record<string, unknown>) => ({ v: 2, cards, skills: {}, days: {}, cases: {} });
    const first = await sync({ base: base({ a: 1 }) });
    expect(first.body.base).toEqual(base({ a: 1 }));
    const second = await sync({ base: base({ b: 2 }) });
    expect(second.body.base).toEqual(base({ a: 1 }));
  });

  it("pulls settings and profile stamps from a clock far ahead back to now + 1 day", async () => {
    const now = Date.now();
    const r = await sync({
      settings: { value: { goal: 20, newPerDay: 10 }, updatedAt: now + 365 * 86_400_000 },
      profile: { value: { name: "Ola" }, updatedAt: now + 365 * 86_400_000 },
    });
    expect(r.status).toBe(200);
    expect(r.body.settings!.updatedAt).toBeLessThanOrEqual(Date.now() + MAX_CLOCK_AHEAD_MS);
    expect(r.body.settings!.updatedAt).toBeGreaterThanOrEqual(now + MAX_CLOCK_AHEAD_MS);
    expect(r.body.profile!.updatedAt).toBe(r.body.settings!.updatedAt);
    // a device with a right clock wins again a day later, not a year later
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now + MAX_CLOCK_AHEAD_MS + 60_000);
    const later = await sync({ settings: { value: { goal: 40, newPerDay: 5 }, updatedAt: Date.now() } });
    expect(later.body.settings!.value.goal).toBe(40);
  });

  it("413 above SYNC_MAX_PUSH events or 1 MB", async () => {
    const many = Array.from({ length: SYNC_MAX_PUSH + 1 }, (_, i) => ev(i + 1));
    const r = await sync({ events: many });
    expect(r.status).toBe(413);
    expect(r.body.error).toBe("too_large");
    const big = await sync({ base: { blob: "x".repeat(1_000_001) } });
    expect(big.status).toBe(413);
  });

  it.each([
    ["no cursor", { cursor: undefined }],
    ["negative cursor", { cursor: -1 }],
    ["events not a list", { events: {} }],
    ["a bad event", { events: [{ ...ev(1), verdict: "nope" }] }],
    ["bad settings", { settings: { value: { goal: "20", newPerDay: 10 }, updatedAt: 1 } }],
    ["settings without a stamp", { settings: { value: { goal: 20, newPerDay: 10 } } }],
    ["a long name", { profile: { value: { name: "x".repeat(41) }, updatedAt: 1 } }],
    ["base not an object", { base: [1] }],
    ["base without v 2", { base: { v: 1, cards: {}, skills: {}, days: {}, cases: {} } }],
    ["base missing a record", { base: { v: 2, cards: {}, skills: {}, days: {} } }],
    ["base with a list for cards", { base: { v: 2, cards: [], skills: {}, days: {}, cases: {} } }],
  ])("400 for %s, and nothing stored", async (_n, body) => {
    const r = await sync({ events: [ev(9)], ...body });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("bad_request");
    expect(sqliteOf(h.env.DB).prepare("SELECT COUNT(*) AS n FROM events").get()).toEqual({ n: 0 });
  });
});

describe("readBody", () => {
  /** A body that never ends, with no Content-Length: the reader must stop at the cap. */
  function endless(): { req: Request; pulled: () => number } {
    let n = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        n++;
        c.enqueue(new Uint8Array(1024).fill(32));
      },
    });
    return { req: { headers: new Headers(), body } as unknown as Request, pulled: () => n };
  }

  it("stops reading past maxBytes instead of buffering the whole body", async () => {
    const { req, pulled } = endless();
    expect(await readBody(req, 10 * 1024)).toEqual({ ok: false, reason: "too_large" });
    expect(pulled()).toBeLessThan(15);
  });

  it("refuses a declared Content-Length over the cap unread", async () => {
    const req = new Request("https://x/", { method: "POST", body: "{}", headers: { "Content-Length": "999999" } });
    expect(await readBody(req, 1024)).toEqual({ ok: false, reason: "too_large" });
    expect(req.bodyUsed).toBe(false);
  });

  it("parses JSON within the cap and tells bad JSON apart", async () => {
    const ok = new Request("https://x/", { method: "POST", body: JSON.stringify({ a: "ż" }) });
    expect(await readBody(ok, 1024)).toEqual({ ok: true, value: { a: "ż" } });
    const bad = new Request("https://x/", { method: "POST", body: "{nope" });
    expect(await readBody(bad, 1024)).toEqual({ ok: false, reason: "bad_json" });
  });
});
