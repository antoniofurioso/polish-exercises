"use client";

import type {
  ApiError,
  AuthVerifyResponse,
  CheckoutRequest,
  ConsentResponse,
  Currency,
  Entitlement,
  ErrorCode,
  ExportResponse,
  MeResponse,
  Plan,
  PublicConfig,
  RefreshResponse,
  UrlResponse,
  User,
} from "../workers/api/src/contract";
import {
  clearAccountState,
  readPublicConfig,
  readStoredAccount,
  startAccountState,
  writePublicConfig,
  writeStoredAccount,
} from "./storage";
import { syncNow } from "./sync";

/**
 * The API client for workers/api (plans/phase-4.md §4, §5, §13.2). Typed from
 * the Worker's contract (types only). With `NEXT_PUBLIC_API_URL` unset there are
 * no accounts: `apiEnabled()` is false and nothing here is called.
 *
 * The token and the cached entitlement live in polish.account.v1 (lib/storage.ts).
 * A 401 from any call drops the token and keeps the local data.
 */

export type { AccountState, StoredAccount } from "./storage";
export { readAccount, useAccount, usePublicConfig, readPublicConfig, useMergedNotice, dismissMergedNotice } from "./storage";
export type { Currency, Entitlement, EntitlementStatus, ErrorCode, Plan, PublicConfig, User } from "../workers/api/src/contract";

/** Same value as the contract's constant: offline access lasts 7 days past the last check (§5). */
export const OFFLINE_GRACE_MS = 7 * 86_400_000;

/** The API base URL inlined at build time, without a trailing slash; "" when accounts are off. */
export const apiUrl = (): string => (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");

/** Accounts, sync and the paywall exist in this build. */
export const apiEnabled = (): boolean => apiUrl() !== "";

/** "network": the request never got an answer (offline, CORS, DNS) or accounts are off. */
export type ApiErrorCode = ErrorCode | "network";

export class ApiFailure extends Error {
  readonly code: ApiErrorCode;
  /** HTTP status; 0 for a network failure. */
  readonly status: number;
  /** invalid_code: attempts left on this code. */
  readonly attemptsLeft?: number;
  /** rate_limited: seconds to wait. */
  readonly retryAfter?: number;

  constructor(code: ApiErrorCode, status: number, message?: string, extra: Pick<ApiError, "attemptsLeft" | "retryAfter"> = {}) {
    super(message || code);
    this.name = "ApiFailure";
    this.code = code;
    this.status = status;
    if (typeof extra.attemptsLeft === "number") this.attemptsLeft = extra.attemptsLeft;
    if (typeof extra.retryAfter === "number") this.retryAfter = extra.retryAfter;
  }
}

const ERROR_CODES: readonly ErrorCode[] = [
  "bad_request",
  "invalid_email",
  "invalid_code",
  "code_expired",
  "rate_limited",
  "email_unavailable",
  "unauthorized",
  "too_large",
  "already_subscribed",
  "has_lifetime_or_beta",
  "offer_ended",
  "no_customer",
  "stripe_error",
  "bad_signature",
  "bad_link",
  "not_found",
  "internal",
];

export type RequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  /** Send the stored token; a 401 then signs out locally. */
  auth?: boolean;
  /** `fetch` keepalive (the page is being hidden); the body must stay under 64 KB. */
  keepalive?: boolean;
};

/**
 * One call to the API: JSON in and out. Throws `ApiFailure` for every non-2xx
 * answer and for network failures. Used by lib/sync.ts too.
 */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const base = apiUrl();
  if (!base) throw new ApiFailure("network", 0, "accounts are off in this build");
  const headers: Record<string, string> = {};
  let token: string | null = null;
  if (opts.auth) {
    token = readStoredAccount()?.token ?? null;
    if (!token) throw new ApiFailure("unauthorized", 401, "signed out");
    headers.Authorization = `Bearer ${token}`;
  }
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      keepalive: opts.keepalive,
      credentials: "omit",
    });
  } catch (error) {
    throw new ApiFailure("network", 0, error instanceof Error ? error.message : "network error");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (res.ok) return data as T;

  const err = (data ?? {}) as Partial<ApiError>;
  const code: ErrorCode =
    res.status === 401
      ? "unauthorized"
      : ERROR_CODES.includes(err.error as ErrorCode)
        ? (err.error as ErrorCode)
        : "internal";
  // the token is dead: drop it (only if it is still the one we sent) and keep the local data
  if (code === "unauthorized" && token && readStoredAccount()?.token === token) clearAccountState();
  throw new ApiFailure(code, res.status, err.message, err);
}

// ---- access (§5) ---------------------------------------------------------------

/**
 * May practise at `now`, from the cached entitlement: `access`, and `now` before
 * the later of `until` (none for beta and Lifetime) and 7 days after the last check.
 */
export function hasAccess(entitlement: Entitlement | null | undefined, now: number): boolean {
  if (!entitlement || !entitlement.access) return false;
  const until = entitlement.until ?? Infinity;
  return now < Math.max(until, entitlement.checkedAt + OFFLINE_GRACE_MS);
}

// ---- cache updates ---------------------------------------------------------------

function updateAccount(patch: { user?: User; entitlement?: Entitlement }): void {
  const account = readStoredAccount();
  if (!account) return;
  writeStoredAccount({
    ...account,
    ...(patch.user ? { user: patch.user, email: patch.user.email } : {}),
    ...(patch.entitlement ? { entitlement: patch.entitlement } : {}),
  });
}

const background = (work: () => Promise<unknown>) => {
  void work().catch(() => {
    // best effort: retried on the next app start, `online` or focus
  });
};

// ---- calls (§4.2) ------------------------------------------------------------------

/** `GET /config`, cached in polish.apiConfig.v1 (read it live with `usePublicConfig`). */
export async function getConfig(): Promise<PublicConfig> {
  const config = await request<PublicConfig>("/config");
  writePublicConfig(config);
  return config;
}

/** Sends a sign-in code to `email`. Errors: invalid_email, rate_limited (`retryAfter`), email_unavailable. */
export async function startSignIn(email: string): Promise<void> {
  await request("/auth/start", { body: { email: email.trim() } });
}

/**
 * Checks the code and signs in: saves the token and entitlement, makes the whole
 * local log the outbox (§7), then syncs and refreshes `/me` in the background.
 * Errors: invalid_code (`attemptsLeft`), code_expired, rate_limited.
 */
export async function verifyCode(email: string, code: string, marketingConsent: boolean): Promise<AuthVerifyResponse> {
  const res = await request<AuthVerifyResponse>("/auth/verify", {
    body: { email: email.trim(), code: code.trim(), marketingConsent },
  });
  startAccountState({ token: res.token, email: res.user.email, user: res.user, entitlement: res.entitlement });
  background(() => syncNow({ force: true }));
  background(fetchMe);
  return res;
}

/** `GET /me`: refreshes the cached user, entitlement and config. */
export async function fetchMe(): Promise<MeResponse> {
  const res = await request<MeResponse>("/me", { auth: true });
  updateAccount({ user: res.user, entitlement: res.entitlement });
  writePublicConfig(res.config);
  return res;
}

/** The email-tips opt-in (marketing consent). */
export async function setConsent(marketing: boolean): Promise<User> {
  const res = await request<ConsentResponse>("/account/consent", { body: { marketing }, auth: true });
  updateAccount({ user: res.user });
  return res.user;
}

/** Stripe Checkout for a plan; returns its URL to navigate to. Errors: already_subscribed, has_lifetime_or_beta, offer_ended. */
export async function startCheckout(plan: Plan, currency: Currency): Promise<string> {
  const body: CheckoutRequest = { plan, currency };
  const res = await request<UrlResponse>("/billing/checkout", { body, auth: true });
  return res.url;
}

/** Re-reads the entitlement from Stripe (the return from checkout) and caches it. */
export async function refreshBilling(): Promise<Entitlement> {
  const res = await request<RefreshResponse>("/billing/refresh", { method: "POST", auth: true });
  updateAccount({ entitlement: res.entitlement });
  return res.entitlement;
}

/** The Stripe Customer Portal URL. Errors: no_customer. */
export async function openPortal(): Promise<string> {
  const res = await request<UrlResponse>("/billing/portal", { method: "POST", auth: true });
  return res.url;
}

/** Everything the server holds about the account (GDPR export). */
export const exportData = (): Promise<ExportResponse> => request<ExportResponse>("/account/export", { auth: true });

/**
 * Deletes the account on the server, then signs out here. Local data stays; the
 * UI offers to clear it (§12). Errors: stripe_error (nothing was deleted).
 */
export async function deleteAccount(): Promise<void> {
  await request("/account", { method: "DELETE", auth: true });
  clearAccountState();
}

/**
 * Signs out: tells the server (best effort, never waited on beyond the call) and
 * clears the token, outbox, cursor and entitlement. Local progress stays.
 */
export async function signOut(): Promise<void> {
  if (readStoredAccount()) {
    try {
      await request("/auth/signout", { method: "POST", auth: true });
    } catch {
      // offline or already expired: the token is dropped here either way
    }
  }
  clearAccountState();
}

/** The cached config, or a fetch when there is none yet. */
export async function ensureConfig(): Promise<PublicConfig> {
  return readPublicConfig() ?? getConfig();
}
