import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runBillingCron } from "../src/billing";
import { CLEANUP_CRON, HOURLY_CRON } from "../src/cron";
import { bumpCounter } from "../src/db";
import worker from "../src/index";
import { sqliteOf } from "./d1";
import { type Harness, harness, makeCtx } from "./helpers";

vi.mock("../src/list", () => ({ syncContact: vi.fn(async () => {}), removeContact: vi.fn(async () => {}) }));
vi.mock("../src/billing", () => ({
  billingRoutes: {},
  deleteBillingFor: vi.fn(async () => {}),
  runBillingCron: vi.fn(async () => {}),
}));

const NOW = Date.parse("2026-10-10T12:00:00Z");
const DAY = 86_400_000;
let h: Harness;
const db = () => sqliteOf(h.env.DB);

beforeEach(() => {
  vi.clearAllMocks();
  h = harness();
  db().exec(`INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@b.pl', 0)`);
});
afterEach(() => vi.unstubAllGlobals());

async function runScheduled(cron: string) {
  const pending: Promise<unknown>[] = [];
  await worker.scheduled({ scheduledTime: NOW, cron, noRetry() {} } as ScheduledController, h.env, makeCtx(pending));
  await Promise.all(pending);
}

const code = (email: string, expires: number, windowStart: number, day: string) =>
  db()
    .prepare(
      `INSERT INTO login_codes VALUES (?, 'h', ?, 0, ?, ?, 1, 1, ?)`,
    )
    .run(email, expires, windowStart, windowStart, day);

describe("cron", () => {
  it("the hourly trigger runs the billing cron only", async () => {
    db().exec(`INSERT INTO sessions VALUES ('s1', 'u1', 0, 0, ${NOW - 1})`);
    await runScheduled(HOURLY_CRON);
    expect(runBillingCron).toHaveBeenCalledWith(h.env, NOW);
    expect(db().prepare("SELECT COUNT(*) AS n FROM sessions").get()).toEqual({ n: 1 });
  });

  it("the daily trigger cleans up only", async () => {
    code("old@b.pl", NOW - 1, NOW - DAY, "2026-10-09"); // gone
    code("today@b.pl", NOW - 1, NOW - 3_600_000, "2026-10-10"); // keeps today's limit
    code("live@b.pl", NOW + 60_000, NOW - DAY, "2026-10-09"); // still valid
    db().exec(`INSERT INTO sessions VALUES ('s1', 'u1', 0, 0, ${NOW - 1}), ('s2', 'u1', 0, 0, ${NOW + 1})`);
    db().exec(`INSERT INTO stripe_events VALUES ('evt_old', 'x', ${NOW - 31 * DAY}, 1), ('evt_new', 'x', ${NOW - DAY}, 1)`);
    db().exec(`INSERT INTO counters VALUES ('email', '2026-09-01', 5), ('email', '2026-10-10', 5)`);

    await runScheduled(CLEANUP_CRON);

    expect(runBillingCron).not.toHaveBeenCalled();
    const ids = (sql: string) => db().prepare(sql).all().map((r) => Object.values(r)[0]);
    expect(ids("SELECT email FROM login_codes ORDER BY email")).toEqual(["live@b.pl", "today@b.pl"]);
    expect(ids("SELECT token_hash FROM sessions")).toEqual(["s2"]);
    expect(ids("SELECT id FROM stripe_events")).toEqual(["evt_new"]);
    expect(ids("SELECT day FROM counters")).toEqual(["2026-10-10"]);
  });

  it("a failing job is logged, never thrown", async () => {
    vi.mocked(runBillingCron).mockRejectedValueOnce(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runScheduled(HOURLY_CRON)).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("the trigger strings match wrangler.toml", () => {
    const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
    expect(toml).toContain(`crons = ["${HOURLY_CRON}", "${CLEANUP_CRON}"]`);
  });
});

describe("bumpCounter", () => {
  it("counts up to the cap, per key and day", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await bumpCounter(h.env.DB, "email", "2026-10-10", 3));
    expect(results).toEqual([true, true, true, false]);
    expect(await bumpCounter(h.env.DB, "email", "2026-10-11", 3)).toBe(true);
    expect(await bumpCounter(h.env.DB, "other", "2026-10-10", 3)).toBe(true);
    expect(await bumpCounter(h.env.DB, "x", "2026-10-10", 0)).toBe(false);
  });
});

describe("test D1", () => {
  it("rolls a failed batch back and enforces foreign keys", async () => {
    const d = h.env.DB;
    await expect(
      d.batch([
        d.prepare("INSERT INTO users (id, email, created_at) VALUES ('u2', 'c@d.pl', 0)"),
        d.prepare("INSERT INTO sessions VALUES ('s', 'missing', 0, 0, 0)"),
      ]),
    ).rejects.toThrow();
    expect(await d.prepare("SELECT COUNT(*) AS n FROM users").first("n")).toBe(1);
  });
});
