import type {
  Stamped,
  SyncRequest,
  SyncResponse,
  WireBase,
  WireEvent,
  WireProfile,
  WireSettings,
} from "../../workers/api/src/contract";

/** A Map-backed localStorage and a minimal `window` for the storage tests (Node has neither). */
export class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

/** Installs a fresh fake `window` (one device) and returns its storage. */
export function installWindow(storage = new MemoryStorage()): MemoryStorage {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    addEventListener() {},
    removeEventListener() {},
  };
  return storage;
}

type Row = { seq: number; userId: string; event: WireEvent };

/**
 * An in-memory stand-in for workers/api's sync and auth (plans/phase-4.md §6.2):
 * INSERT OR IGNORE by (t, card), events after the cursor by seq with paging,
 * last-write-wins settings and profile, first-device-wins base.
 */
export class FakeServer {
  rows: Row[] = [];
  seq = 0;
  settings: Stamped<WireSettings> | null = null;
  profile: Stamped<WireProfile> | null = null;
  base: WireBase | null = null;
  maxPull = 5000;
  requests: { path: string; body: unknown; auth: string | null }[] = [];
  /** Next responses to fail (status, body), consumed in order. */
  failures: { status: number; body: unknown }[] = [];
  offline = false;
  token = "tok-1";

  fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    if (this.offline) throw new TypeError("Failed to fetch");
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const auth = (init.headers as Record<string, string> | undefined)?.Authorization ?? null;
    this.requests.push({ path, body, auth });
    const fail = this.failures.shift();
    if (fail) return json(fail.status, fail.body);
    if (path === "/sync") return json(200, this.sync(body as SyncRequest));
    if (path === "/auth/verify")
      return json(200, {
        token: this.token,
        user: { id: "u1", email: body.email, createdAt: 1, marketingConsent: !!body.marketingConsent },
        isNew: true,
        entitlement: { status: "beta", plan: "beta", access: true, until: null, trialEnd: null, trialUsed: false, checkedAt: 1 },
      });
    if (path === "/auth/signout") return json(200, { ok: true });
    if (path === "/config") return json(200, { betaOpen: true, lifetimeOfferUntil: null, currency: "eur" });
    if (path === "/me")
      return json(200, {
        user: { id: "u1", email: "a@b.co", createdAt: 1, marketingConsent: false },
        entitlement: { status: "beta", plan: "beta", access: true, until: null, trialEnd: null, trialUsed: false, checkedAt: 2 },
        config: { betaOpen: true, lifetimeOfferUntil: null, currency: "pln" },
      });
    return json(404, { error: "not_found" });
  };

  sync(req: SyncRequest): SyncResponse {
    for (const event of req.events) {
      if (this.rows.some((r) => r.event.t === event.t && r.event.card === event.card)) continue;
      this.rows.push({ seq: ++this.seq, userId: "u1", event: structuredClone(event) });
    }
    if (req.settings && (!this.settings || req.settings.updatedAt > this.settings.updatedAt)) this.settings = req.settings;
    if (req.profile && (!this.profile || req.profile.updatedAt > this.profile.updatedAt)) this.profile = req.profile;
    if (req.base && !this.base) this.base = req.base;
    const after = this.rows.filter((r) => r.seq > req.cursor).sort((a, b) => a.seq - b.seq);
    const page = after.slice(0, this.maxPull);
    return {
      cursor: page.length ? page[page.length - 1].seq : Math.max(req.cursor, 0),
      events: page.map((r) => structuredClone(r.event)),
      more: after.length > page.length,
      settings: this.settings,
      profile: this.profile,
      base: this.base,
    };
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
