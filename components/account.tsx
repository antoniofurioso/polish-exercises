"use client";

import { Info, X } from "lucide-react";
import { useEffect } from "react";
import {
  apiEnabled,
  dismissMergedNotice,
  getConfig,
  usePublicConfig,
  useMergedNotice,
  type Currency,
  type Entitlement,
  type Plan,
  type PublicConfig,
} from "@/lib/account";
import { PLAN_INFO, isCurrency, isPlan } from "@/lib/plans";
import { syncNow } from "@/lib/sync";

/**
 * Account pieces shared by the app pages (plans/phase-4.md §13): the
 * after-session sync, the live `/config`, plan names and the "progress merged"
 * notice. All of them do nothing when the build has no API
 * (`NEXT_PUBLIC_API_URL` unset).
 */

/** Rendered in a session's results (Runner's `summaryExtra`): pushes the finished session at once. */
export function SyncOnFinish() {
  useEffect(() => {
    void syncNow({ force: true }).catch(() => {});
  }, []);
  return null;
}

/** `GET /config`, cached, refreshed once per mount; null before the first answer or without an API. */
export function useLiveConfig(): PublicConfig | null {
  const config = usePublicConfig();
  useEffect(() => {
    if (apiEnabled()) void getConfig().catch(() => {});
  }, []);
  return config;
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** "12 October 2026". */
export const formatDate = (ms: number): string => DATE.format(new Date(ms));

/** The plan in a few words, for chips and the sidebar: "Pro · beta", "Annual", "No plan". */
export function planName(entitlement: Entitlement | null | undefined): string {
  if (!entitlement || !entitlement.plan || entitlement.status === "none") return "No plan";
  if (entitlement.plan === "beta") return "Pro · beta";
  const label = PLAN_INFO[entitlement.plan].label;
  if (entitlement.status === "trialing") return `${label} · trial`;
  return label;
}

/** Shown once after the first sync folded this device's progress into the account (§7). */
export function MergedNotice() {
  const merged = useMergedNotice();
  if (!merged) return null;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-8 lg:px-14">
      <div role="status" className="card flex items-center gap-3 py-2 pl-4 pr-2">
        <Info size={20} className="shrink-0 text-accent" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm">Your progress on this device was merged into your account.</p>
        <button type="button" className="icon-btn" aria-label="Dismiss" onClick={dismissMergedNotice}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** The plan and currency of a checkout in progress, for `checkout_completed` on the way back (this tab only). */
const CHECKOUT_MARK = "polish.checkout.v1";

export type CheckoutMark = { plan: Plan; currency: Currency };

export function markCheckout(mark: CheckoutMark): void {
  try {
    window.sessionStorage.setItem(CHECKOUT_MARK, JSON.stringify(mark));
  } catch {
    // storage blocked: the event falls back to the entitlement's plan
  }
}

/** The mark left by /plans, removed as it is read; null when the checkout started elsewhere. */
export function takeCheckout(): CheckoutMark | null {
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_MARK);
    window.sessionStorage.removeItem(CHECKOUT_MARK);
    const mark = raw ? (JSON.parse(raw) as Partial<CheckoutMark>) : null;
    return mark && isPlan(mark.plan) && isCurrency(mark.currency) ? { plan: mark.plan, currency: mark.currency } : null;
  } catch {
    return null;
  }
}
