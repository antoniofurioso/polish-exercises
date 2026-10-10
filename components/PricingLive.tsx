"use client";

import { Check, Gift } from "lucide-react";
import Link from "next/link";
import { formatDate, useLiveConfig } from "@/components/account";
import { useNow } from "@/components/today";
import { DEFAULT_CURRENCY, PLAN_INFO, TAX_NOTE, TRIAL_DAYS, formatPrice, lifetimeOffered } from "@/lib/plans";
import { signInHref } from "@/lib/site";

/**
 * The landing page's run-time pricing bits (plans/phase-4.md §13.3): the page
 * is static, so whether the beta is open and whether Lifetime is on offer come
 * from `GET /config` after load. Only rendered when the build has an API.
 */

/** The first hero perk: the beta while it is open, the trial after. */
export function TrialPerk() {
  const config = useLiveConfig();
  return <>{config?.betaOpen ? "Free during the beta" : `${TRIAL_DAYS}-day free trial`}</>;
}

/** "Free during the beta: sign in to start", while the beta is open. */
export function BetaNote() {
  const config = useLiveConfig();
  if (!config?.betaOpen) return null;
  return (
    <div className="card mx-auto mt-10 flex max-w-3xl flex-wrap items-center gap-4 p-5 sm:p-6">
      <Gift size={24} className="shrink-0 text-accent" aria-hidden="true" />
      <p className="min-w-0 flex-[1_1_15rem] text-[0.9375rem]">
        <strong>Free during the beta: sign in to start.</strong> Accounts made during the beta keep Pro for good, with
        no card.
      </p>
      <Link href={signInHref("/today")} className="btn btn-primary">
        Sign in
      </Link>
    </div>
  );
}

/** A third card, Lifetime, while the offer runs. */
export function LifetimeCard({ features }: { features: string[] }) {
  const config = useLiveConfig();
  const now = useNow();
  if (!config || !lifetimeOffered(config, now) || config.lifetimeOfferUntil === null) return null;
  const currency = config.currency ?? DEFAULT_CURRENCY;
  return (
    <div className="card flex min-w-0 flex-[1_1_16rem] flex-col p-8 sm:max-w-sm">
      <p className="font-semibold">{PLAN_INFO.lifetime.label}</p>
      <p className="mt-3 text-[2.75rem] font-bold tracking-tight">{formatPrice("lifetime", currency)}</p>
      <p className="text-sm text-muted">once · {TAX_NOTE[currency]}</p>
      <p className="mt-2 text-sm font-medium text-accent-strong">Offer ends {formatDate(config.lifetimeOfferUntil)}</p>
      <ul className="mt-6 flex flex-col gap-3 text-[0.9375rem]">
        {features.map((f) => (
          <li key={f} className="flex gap-2.5">
            <Check size={20} className="shrink-0 text-accent" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-8">
        <Link href="/plans?next=%2Ftoday" className="btn btn-secondary btn-block">
          Get Lifetime
        </Link>
      </div>
    </div>
  );
}
