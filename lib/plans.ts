import type { Currency, Plan, PublicConfig } from "../workers/api/src/contract";

/**
 * The plans and prices for display (plans/phase-4.md §4.5). The landing page is
 * static, so prices live here; the Worker maps a plan to its Stripe price, and
 * the owner keeps the Stripe prices equal to these. Whether Lifetime shows and
 * whether the beta is open come from `GET /config` at run time.
 */

export type { Currency, Plan } from "../workers/api/src/contract";

/** Same values as the contract's constants (it is imported for types only). */
export const PLANS: readonly Plan[] = ["monthly", "annual", "lifetime"];
export const CURRENCIES: readonly Currency[] = ["eur", "usd", "pln"];
export const DEFAULT_PLAN: Plan = "annual";
export const DEFAULT_CURRENCY: Currency = "eur";
/** Monthly and Annual start with a free trial of this many days. */
export const TRIAL_DAYS = 3;

export type PlanInfo = {
  label: string;
  /** Minor units (cents, grosze). */
  prices: Record<Currency, number>;
  period: "month" | "year" | "once";
  trial: boolean;
};

export const PLAN_INFO: Record<Plan, PlanInfo> = {
  monthly: { label: "Monthly", prices: { eur: 699, usd: 799, pln: 2999 }, period: "month", trial: true },
  annual: { label: "Annual", prices: { eur: 4900, usd: 5499, pln: 19900 }, period: "year", trial: true },
  lifetime: { label: "Lifetime", prices: { eur: 9900, usd: 10900, pln: 39900 }, period: "once", trial: false },
};

/** EUR and PLN prices include VAT; USD prices exclude tax (plans/phase-4.md, open point 2). */
export const TAX_NOTE: Record<Currency, string> = {
  eur: "incl. VAT",
  usd: "plus tax where applicable",
  pln: "incl. VAT",
};

const LOCALE: Record<Currency, string> = { eur: "en-IE", usd: "en-US", pln: "pl-PL" };

/** An amount in minor units as a price: "€6.99", "€49", "$54.99", "29,99 zł" (non-breaking space before zł). */
export function formatAmount(minor: number, currency: Currency): string {
  const whole = minor % 100 === 0;
  return new Intl.NumberFormat(LOCALE[currency], {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(minor / 100);
}

/** A plan's price in a currency, e.g. formatPrice("monthly", "eur") → "€6.99". */
export const formatPrice = (plan: Plan, currency: Currency): string =>
  formatAmount(PLAN_INFO[plan].prices[currency], currency);

export const isPlan = (x: unknown): x is Plan => typeof x === "string" && (PLANS as readonly string[]).includes(x);
export const isCurrency = (x: unknown): x is Currency =>
  typeof x === "string" && (CURRENCIES as readonly string[]).includes(x);

/** The Lifetime offer is open: `/config` names an end that is still ahead. */
export const lifetimeOffered = (config: PublicConfig | null, now: number): boolean =>
  !!config && config.lifetimeOfferUntil !== null && now < config.lifetimeOfferUntil;

/** The plans to show, in order: Monthly, Annual, and Lifetime while the offer runs. */
export const plansOffered = (config: PublicConfig | null, now: number): Plan[] =>
  PLANS.filter((plan) => plan !== "lifetime" || lifetimeOffered(config, now));
