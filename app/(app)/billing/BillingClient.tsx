"use client";

import { ArrowRight, Check, CreditCard, ExternalLink, Gift, Infinity as InfinityIcon, LogIn, Mail, Receipt } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountTabs } from "@/components/AccountTabs";
import { AppPage } from "@/components/AppShell";
import { formatDate, planName, takeCheckout, useLiveConfig } from "@/components/account";
import {
  ApiFailure,
  apiEnabled,
  fetchMe,
  hasAccess,
  openPortal,
  refreshBilling,
  useAccount,
  type Entitlement,
} from "@/lib/account";
import { track } from "@/lib/analytics";
import { BRAND } from "@/lib/brand";
import { DEFAULT_CURRENCY, isPlan } from "@/lib/plans";
import { readPublicConfig, useHydrated } from "@/lib/storage";
import { signInHref } from "@/lib/site";

/** The return from Stripe Checkout polls `GET /me` this often, for this long (plans/phase-4.md §9.4). */
const POLL_MS = 2_000;
const POLL_FOR_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The current plan (plans/phase-4.md §13.3); without an API in the build, the free beta as before. */
export function BillingPage() {
  return apiEnabled() ? <AccountBilling /> : <BetaBilling />;
}

// ---- with accounts ------------------------------------------------------------------

type Described = { title: string; detail: string; icon: "gift" | "lifetime" | "card" };

function describe(e: Entitlement | null): Described {
  const date = (ms: number | null) => (ms ? formatDate(ms) : "the end of the period");
  if (!e || !e.plan || e.status === "none") {
    return { title: "No plan", detail: "Choose a plan to practise. Monthly and Annual start with a free trial.", icon: "card" };
  }
  if (e.plan === "beta" || e.status === "beta") {
    return {
      title: "Beta: Pro free, thank you",
      detail: "You joined during the beta, so Pro is yours for good. No card, nothing to pay.",
      icon: "gift",
    };
  }
  if (e.status === "lifetime") return { title: "Lifetime", detail: "Paid once. Pro is yours for good.", icon: "lifetime" };
  const title = planName(e);
  switch (e.status) {
    case "trialing":
      return {
        title,
        detail: `Your free trial ends on ${date(e.trialEnd ?? e.until)}. The first charge is then, unless you cancel before.`,
        icon: "card",
      };
    case "active":
      return { title, detail: `Renews on ${date(e.until)}.`, icon: "card" };
    case "past_due":
      return {
        title,
        detail: `Your last payment didn’t go through. Update your card in Manage billing: Pro stays on until ${date(e.until)}.`,
        icon: "card",
      };
    case "canceling":
      return { title, detail: `Cancelled. Pro stays on until ${date(e.until)}, and nothing more is charged.`, icon: "card" };
    default:
      return { title, detail: "", icon: "card" };
  }
}

function AccountBilling() {
  const params = useSearchParams();
  const fromCheckout = params.get("checkout") === "done";
  const hydrated = useHydrated();
  const account = useAccount();
  const config = useLiveConfig();
  const signedIn = account !== null;
  /** The return from checkout: idle until it resolves, then done (access) or slow (not yet). */
  const [phase, setPhase] = useState<"idle" | "done" | "slow">("idle");

  useEffect(() => {
    if (!fromCheckout || !hydrated || !signedIn) return;
    let alive = true;
    void (async () => {
      const started = Date.now();
      let entitlement: Entitlement | null = null;
      try {
        entitlement = await refreshBilling();
      } catch {
        // the webhook may still land: poll /me
      }
      while (alive && !hasAccess(entitlement, Date.now()) && Date.now() - started < POLL_FOR_MS) {
        await sleep(POLL_MS);
        if (!alive) return;
        try {
          entitlement = (await fetchMe()).entitlement;
        } catch {
          // offline for a moment: try again
        }
      }
      if (!alive) return;
      if (!hasAccess(entitlement, Date.now())) {
        setPhase("slow");
        return;
      }
      setPhase("done");
      const mark =
        takeCheckout() ??
        (entitlement && isPlan(entitlement.plan)
          ? { plan: entitlement.plan, currency: readPublicConfig()?.currency ?? DEFAULT_CURRENCY }
          : null);
      if (mark) track("checkout_completed", mark);
      // a reload must not count the purchase again
      window.history.replaceState(null, "", "/billing");
    })();
    return () => {
      alive = false;
    };
  }, [fromCheckout, hydrated, signedIn]);

  if (!hydrated) {
    return (
      <AppPage title="Billing" width="max-w-5xl">
        <AccountTabs />
      </AppPage>
    );
  }

  if (!account) {
    return (
      <AppPage title="Billing" width="max-w-5xl">
        <AccountTabs />
        <section className="card flex flex-wrap items-center gap-5 p-6 sm:p-7">
          <span className="tile">
            <LogIn size={24} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-[1_1_15rem]">
            <h2 className="text-xl font-bold">Sign in to see your plan</h2>
            <p className="mt-1 text-sm text-muted">
              {fromCheckout
                ? "If you just paid in another window, go back to the app there: it unlocks by itself."
                : config?.betaOpen
                  ? "Free during the beta: sign in to start, and Pro is yours with no card."
                  : "Your plan, payments and invoices are linked to your account."}
            </p>
          </div>
          <Link href={signInHref("/billing")} className="btn btn-primary">
            Sign in
          </Link>
        </section>
      </AppPage>
    );
  }

  const entitlement = account.entitlement;
  const plan = describe(entitlement);
  const paid = !!entitlement?.plan && entitlement.plan !== "beta" && entitlement.status !== "none";
  const noPlan = !entitlement?.plan || entitlement.status === "none";
  const Icon = plan.icon === "gift" ? Gift : plan.icon === "lifetime" ? InfinityIcon : CreditCard;

  return (
    <AppPage title="Billing" width="max-w-5xl">
      <AccountTabs />

      {fromCheckout || phase !== "idle" ? <CheckoutReturn phase={phase} /> : null}

      <section aria-labelledby="plan-title" className="card flex flex-wrap items-center gap-5 p-6 sm:p-7">
        <span className="tile">
          <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-[1_1_12rem]">
          <p className="text-[0.8125rem] font-medium text-muted">Current plan</p>
          <h2 id="plan-title" className="text-xl font-bold">
            {plan.title}
          </h2>
        </div>
        <p className="min-w-0 flex-[1_1_15rem] text-sm text-muted">{plan.detail}</p>
      </section>

      {noPlan ? (
        <section className="card mt-4 flex flex-wrap items-center justify-between gap-4 p-6 sm:p-7">
          <div className="min-w-0 flex-[1_1_15rem]">
            <h2 className="text-[1.0625rem] font-semibold">Choose a plan</h2>
            <p className="mt-0.5 text-sm text-muted">Monthly or Annual, with a 3-day free trial.</p>
          </div>
          <Link href="/plans?next=%2Ftoday" className="btn btn-primary">
            See plans
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
      ) : null}

      {paid ? <ManageBilling /> : null}

      <section aria-labelledby="inv-title" className="card mt-4 p-6 sm:p-7">
        <h2 id="inv-title" className="text-[1.0625rem] font-semibold">
          Invoices
        </h2>
        <div className="flex flex-col items-center py-8 text-center">
          <Receipt size={30} strokeWidth={1.5} className="text-muted" aria-hidden="true" />
          <p className="mt-2 max-w-sm text-sm text-muted">
            {paid
              ? "Receipts are emailed by Stripe. Every invoice is also in Manage billing."
              : "No invoices: you haven’t paid for anything."}
          </p>
        </div>
      </section>
    </AppPage>
  );
}

function CheckoutReturn({ phase }: { phase: "idle" | "done" | "slow" }) {
  if (phase === "done") {
    return (
      <section role="status" className="panel-accent mb-4 flex flex-wrap items-center justify-between gap-6 p-7 sm:p-9">
        <div className="relative min-w-0 flex-[1_1_15rem]">
          <h2 className="heading">You’re in</h2>
          <p className="mt-2 text-on-accent-soft">Thank you. Pro is on: every drill, on every device.</p>
        </div>
        <Link href="/today" className="btn btn-inverse btn-lg relative">
          Start today’s practice
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
      </section>
    );
  }
  return (
    <section role="status" className="card mb-4 p-6 sm:p-7">
      <h2 className="text-[1.0625rem] font-semibold">
        {phase === "slow" ? "Your payment is still being confirmed" : "Confirming your payment…"}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {phase === "slow"
          ? "This can take a minute. Reload this page shortly; if Pro still isn’t on, write to us and we’ll sort it out."
          : "This takes a few seconds."}
      </p>
    </section>
  );
}

function ManageBilling() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      window.location.assign(await openPortal());
    } catch (e) {
      setError(
        e instanceof ApiFailure && e.code === "no_customer"
          ? "There’s no billing account yet."
          : e instanceof ApiFailure && e.code === "network"
            ? "You seem to be offline. Try again when you’re connected."
            : "We couldn’t open billing. Please try again.",
      );
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="pay-title" className="card mt-4 flex flex-wrap items-center justify-between gap-4 p-6 sm:p-7">
      <div className="min-w-0 flex-[1_1_15rem]">
        <h2 id="pay-title" className="text-[1.0625rem] font-semibold">
          Payment and plan
        </h2>
        <p className="mt-0.5 text-sm text-muted">Change your card or plan, cancel, or download invoices, on Stripe.</p>
        {error ? (
          <p role="alert" className="mt-2 text-sm font-medium text-accent-strong">
            {error}
          </p>
        ) : null}
      </div>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void open()}>
        {busy ? "Opening…" : "Manage billing"}
        <ExternalLink size={18} aria-hidden="true" />
      </button>
    </section>
  );
}

// ---- without accounts (no API in this build): the free beta -------------------------

const BETA = ["All six drills and the grammar guides", "Today’s practice with spaced repetition", "Progress saved on this device"];
const PRO = ["Everything in the beta", "An account, with your progress on every device"];

/** Everyone is on the free beta, and this page says so. */
function BetaBilling() {
  const notify = BRAND.email
    ? `mailto:${BRAND.email}?subject=${encodeURIComponent(`${BRAND.name} Pro: tell me when it’s ready`)}`
    : null;

  return (
    <AppPage title="Billing" width="max-w-5xl">
      <AccountTabs />
      <section aria-labelledby="plan-title" className="card flex flex-wrap items-center gap-5 p-6 sm:p-7">
        <span className="tile">
          <CreditCard size={24} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-[1_1_12rem]">
          <p className="text-[0.8125rem] font-medium text-muted">Current plan</p>
          <h2 id="plan-title" className="text-xl font-bold">
            Free <span className="text-sm font-medium text-muted">· beta</span>
          </h2>
        </div>
        <p className="min-w-0 flex-[1_1_15rem] text-sm text-muted">
          Everything is free while {BRAND.name} is in beta. No card, no account.
        </p>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <section aria-labelledby="beta-title" className="card flex flex-col p-7">
          <h2 id="beta-title" className="font-semibold">
            Beta
          </h2>
          <p className="mt-2.5 text-[2.5rem] font-bold tracking-tight">€0</p>
          <Features items={BETA} />
          <p className="btn btn-secondary btn-block mt-8 cursor-default text-muted" aria-disabled="true">
            Your plan
          </p>
        </section>
        <section aria-labelledby="pro-title" className="card relative flex flex-col border-2 border-accent p-7">
          <span className="absolute -top-3.5 left-7 rounded-full bg-accent-fill px-3 py-1 text-xs font-semibold text-on-accent">
            Coming later
          </span>
          <h2 id="pro-title" className="font-semibold">
            Pro
          </h2>
          <p className="mt-2.5 text-[2.5rem] font-bold tracking-tight text-muted">Soon</p>
          <Features items={PRO} />
          {notify ? (
            <a href={notify} className="btn btn-primary btn-block mt-8">
              <Mail size={18} aria-hidden="true" />
              Tell me when it’s ready
            </a>
          ) : (
            <p className="mt-8 text-sm text-muted">Pro will be announced here, with its price, before anything changes.</p>
          )}
        </section>
      </div>

      <section aria-labelledby="pay-title" className="card mt-4 flex flex-wrap items-center justify-between gap-4 p-6 sm:p-7">
        <div>
          <h2 id="pay-title" className="text-[1.0625rem] font-semibold">
            Payment method
          </h2>
          <p className="mt-0.5 text-sm text-muted">None. You’ll add one only if you upgrade.</p>
        </div>
      </section>

      <section aria-labelledby="inv-title" className="card mt-4 p-6 sm:p-7">
        <h2 id="inv-title" className="text-[1.0625rem] font-semibold">
          Invoices
        </h2>
        <div className="flex flex-col items-center py-10 text-center">
          <Receipt size={30} strokeWidth={1.5} className="text-muted" aria-hidden="true" />
          <p className="mt-2 text-muted">No invoices yet.</p>
        </div>
      </section>
    </AppPage>
  );
}

function Features({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 flex flex-col gap-3 text-[0.9375rem]">
      {items.map((f) => (
        <li key={f} className="flex gap-2.5">
          <Check size={20} className="shrink-0 text-accent" aria-hidden="true" />
          {f}
        </li>
      ))}
    </ul>
  );
}
