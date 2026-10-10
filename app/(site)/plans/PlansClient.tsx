"use client";

import { ArrowRight, Check, Gift } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { formatDate, markCheckout, planName, useLiveConfig } from "@/components/account";
import { useNow } from "@/components/today";
import { ApiFailure, apiEnabled, getConfig, hasAccess, startCheckout, useAccount } from "@/lib/account";
import { track } from "@/lib/analytics";
import { BRAND } from "@/lib/brand";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  DEFAULT_PLAN,
  PLAN_INFO,
  TAX_NOTE,
  TRIAL_DAYS,
  formatPrice,
  plansOffered,
  type Currency,
  type Plan,
} from "@/lib/plans";
import { safeNext, signInHref } from "@/lib/site";

const DAY = 86_400_000;
const PER: Record<"month" | "year" | "once", string> = { month: "a month", year: "a year", once: "once" };

/** "Save 42%": Annual against twelve months of Monthly, in that currency. */
function annualSaving(currency: Currency): number {
  const monthly = PLAN_INFO.monthly.prices[currency] * 12;
  return Math.round((1 - PLAN_INFO.annual.prices[currency] / monthly) * 100);
}

function checkoutError(error: unknown): string {
  if (!(error instanceof ApiFailure)) return "Something went wrong. Please try again.";
  switch (error.code) {
    case "already_subscribed":
      return "You already have a plan. See it on the Billing page.";
    case "has_lifetime_or_beta":
      return "You already have Pro for good: there is nothing to buy.";
    case "offer_ended":
      return "The Lifetime offer has ended. Monthly and Annual are still open.";
    case "network":
      return "You seem to be offline. Check your connection and try again.";
    case "unauthorized":
      return "Your sign-in has expired. Sign in again to continue.";
    default:
      return "We couldn’t open the payment page. Please try again.";
  }
}

/**
 * The plan picker (plans/phase-4.md §9.4): Annual first in weight and chosen
 * by default, Monthly, and Lifetime only while `/config` says the offer runs.
 * The currency starts from `/config` (the learner's country). Stripe Checkout
 * takes it from there; the way back is /billing?checkout=done.
 */
export function PlansPage() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"), "/today");
  const router = useRouter();
  const account = useAccount();
  const config = useLiveConfig();
  const now = useNow();

  const [chosen, setChosen] = useState<Plan>(DEFAULT_PLAN);
  const [pickedCurrency, setCurrency] = useState<Currency | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!apiEnabled()) {
    return (
      <Frame>
        <h1 className="heading">Free while we’re in beta</h1>
        <p className="lead mt-4">Every drill and every level is free in this version of {BRAND.name}.</p>
        <Link href="/learn" className="btn btn-primary btn-lg mt-8">
          Go to the app
        </Link>
      </Frame>
    );
  }

  const currency = pickedCurrency ?? config?.currency ?? DEFAULT_CURRENCY;
  const offered = plansOffered(config, now);
  const plan = offered.includes(chosen) ? chosen : DEFAULT_PLAN;
  const info = PLAN_INFO[plan];
  const trial = info.trial && !account?.entitlement?.trialUsed;
  const entitled = account !== null && now > 0 && hasAccess(account.entitlement, now);

  if (entitled) {
    return (
      <Frame>
        <h1 className="heading">You already have Pro</h1>
        <p className="lead mt-4">
          Your plan: <strong className="text-foreground">{planName(account.entitlement)}</strong>.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={next} className="btn btn-primary btn-lg">
            Continue
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
          <Link href="/billing" className="btn btn-secondary btn-lg">
            Billing
          </Link>
        </div>
      </Frame>
    );
  }

  const here = `/plans?next=${encodeURIComponent(next)}`;

  const buy = async () => {
    if (!account) {
      router.push(signInHref(here));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      track("checkout_started", { plan, currency });
      const url = await startCheckout(plan, currency);
      markCheckout({ plan, currency });
      window.location.assign(url);
    } catch (e) {
      if (e instanceof ApiFailure && e.code === "offer_ended") void getConfig().catch(() => {});
      if (e instanceof ApiFailure && e.code === "unauthorized") {
        router.push(signInHref(here));
        return;
      }
      setError(checkoutError(e));
      setBusy(false);
    }
  };

  const price = formatPrice(plan, currency);
  const summary =
    info.period === "once"
      ? `One payment of ${price}. Pro is yours for good.`
      : trial
        ? `${TRIAL_DAYS} days free, then ${price} ${PER[info.period]}. Cancel any time before ${formatDate(
            now + TRIAL_DAYS * DAY,
          )} and you pay nothing.`
        : `${price} ${PER[info.period]}. Cancel any time.`;

  return (
    <Frame>
      <p className="eyebrow">{BRAND.name} Pro</p>
      <h1 className="heading mt-3.5">Choose your plan</h1>
      <p className="lead mt-4">Every drill, today’s practice and your progress on every device.</p>

      {config?.betaOpen ? (
        <div className="card mt-8 flex flex-wrap items-center gap-4 p-5">
          <Gift size={22} className="shrink-0 text-accent" aria-hidden="true" />
          <p className="min-w-0 flex-[1_1_14rem] text-[0.9375rem]">
            <strong>Free during the beta.</strong> Sign in and Pro is yours, with no card.
          </p>
          {account ? null : (
            <Link href={signInHref(next)} className="btn btn-secondary btn-sm">
              Sign in
            </Link>
          )}
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.0625rem] font-semibold">Plan</h2>
        <div className="seg" role="group" aria-label="Currency">
          {CURRENCIES.map((c) => (
            <button key={c} type="button" aria-pressed={currency === c} onClick={() => setCurrency(c)}>
              {c.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="sr-only">Plan</legend>
        <div className="flex flex-col gap-3">
          {[...offered]
            .sort((a, b) => Number(b === DEFAULT_PLAN) - Number(a === DEFAULT_PLAN))
            .map((p) => {
              const pi = PLAN_INFO[p];
              const selected = p === plan;
              return (
                <label
                  key={p}
                  className={`relative flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 rounded-[1.25rem] border bg-surface p-5 transition-colors ${
                    selected
                      ? "border-accent shadow-[inset_0_0_0_1px_var(--accent)]"
                      : "border-line-strong hover:border-accent"
                  }`}
                >
                  <input
                    type="radio"
                    name="plan"
                    value={p}
                    checked={selected}
                    onChange={() => setChosen(p)}
                    className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-[1_1_9rem]">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">
                      {pi.label}
                      {p === "annual" ? <span className="chip chip-accent">Save {annualSaving(currency)}%</span> : null}
                    </span>
                    <span className="block text-sm text-muted">
                      {p === "lifetime"
                        ? config?.lifetimeOfferUntil
                          ? `One payment. Offer ends ${formatDate(config.lifetimeOfferUntil)}.`
                          : "One payment."
                        : trial
                          ? `${TRIAL_DAYS}-day free trial`
                          : "Cancel any time"}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-xl font-bold">{formatPrice(p, currency)}</span>
                    <span className="block text-xs text-muted">
                      {pi.period === "once" ? "once" : `per ${pi.period}`} · {TAX_NOTE[currency]}
                    </span>
                  </span>
                </label>
              );
            })}
        </div>
      </fieldset>

      <ul className="mt-6 flex flex-col gap-2.5 text-[0.9375rem]">
        {["All six drills and the grammar guides", "Today’s practice with spaced repetition", "Your progress on every device"].map(
          (f) => (
            <li key={f} className="flex gap-2.5">
              <Check size={20} className="shrink-0 text-accent" aria-hidden="true" />
              {f}
            </li>
          ),
        )}
      </ul>

      <div className="card mt-8 p-5 sm:p-6">
        <p className="text-[0.9375rem]" aria-live="polite">
          {now > 0 ? summary : " "}
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-sm font-medium text-accent-strong">
            {error}
          </p>
        ) : null}
        <button type="button" className="btn btn-primary btn-lg btn-block mt-5" disabled={busy} onClick={() => void buy()}>
          {busy ? "Opening payment…" : !account ? "Sign in to continue" : trial ? "Start free trial" : "Continue to payment"}
          {busy ? null : <ArrowRight size={20} aria-hidden="true" />}
        </button>
        <p className="mt-3 text-xs text-muted">
          Payments are handled by Stripe, who also handle VAT. Manage or cancel any time from Billing.
        </p>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <main className="container-page max-w-2xl py-12 sm:py-20">{children}</main>;
}
