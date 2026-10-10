import type { Currency, PublicConfig } from "./contract";
import type { Env } from "./env";

/** Euro users: the euro area (Bulgaria from 2026) and the microstates using the euro. */
const EURO = new Set([
  "AT", "BE", "BG", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV",
  "MT", "NL", "PT", "SI", "SK",
  "AD", "MC", "SM", "VA", "ME", "XK",
]);

/** PL → pln, euro area → eur, anything else (or unknown) → usd. */
export function currencyFor(country: string | null | undefined): Currency {
  const c = (country ?? "").toUpperCase();
  if (c === "PL") return "pln";
  return EURO.has(c) ? "eur" : "usd";
}

export const betaOpen = (env: Env): boolean => env.BETA_OPEN === "true";

/** LIFETIME_OFFER_UNTIL as ms; null when empty or not a date. Lifetime is refused from this instant on. */
export function lifetimeOfferUntil(env: Pick<Env, "LIFETIME_OFFER_UNTIL">): number | null {
  const raw = (env.LIFETIME_OFFER_UNTIL ?? "").trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function publicConfig(env: Env, request: Request): PublicConfig {
  const cf = (request as Request & { cf?: { country?: string } }).cf;
  return {
    betaOpen: betaOpen(env),
    lifetimeOfferUntil: lifetimeOfferUntil(env),
    currency: currencyFor(cf?.country),
  };
}

/** GET /config may be cached for 5 minutes (it varies by country, so only privately). */
export const CONFIG_CACHE = "private, max-age=300";
