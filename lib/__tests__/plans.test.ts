import { describe, expect, it } from "vitest";
import { CURRENCIES as WIRE_CURRENCIES, PLANS as WIRE_PLANS, TRIAL_DAYS as WIRE_TRIAL_DAYS } from "../../workers/api/src/contract";
import {
  CURRENCIES,
  DEFAULT_PLAN,
  formatAmount,
  formatPrice,
  isCurrency,
  isPlan,
  lifetimeOffered,
  PLAN_INFO,
  PLANS,
  plansOffered,
  TAX_NOTE,
  TRIAL_DAYS,
} from "../plans";

const plain = (s: string) => s.replace(/ /g, " ");

describe("plans", () => {
  it("match the contract's lists", () => {
    expect(PLANS).toEqual(WIRE_PLANS);
    expect(CURRENCIES).toEqual(WIRE_CURRENCIES);
    expect(TRIAL_DAYS).toBe(WIRE_TRIAL_DAYS);
    expect(DEFAULT_PLAN).toBe("annual");
  });

  it("prices per plan and currency (phase-4 table)", () => {
    const table = PLANS.map((plan) => CURRENCIES.map((c) => plain(formatPrice(plan, c))));
    expect(table).toEqual([
      ["€6.99", "$7.99", "29,99 zł"],
      ["€49", "$54.99", "199 zł"],
      ["€99", "$109", "399 zł"],
    ]);
    expect(plain(formatAmount(123456, "pln"))).toBe("1234,56 zł");
  });

  it("periods, trials and tax notes", () => {
    expect(PLAN_INFO.monthly).toMatchObject({ period: "month", trial: true });
    expect(PLAN_INFO.annual).toMatchObject({ period: "year", trial: true });
    expect(PLAN_INFO.lifetime).toMatchObject({ period: "once", trial: false });
    expect(TAX_NOTE).toEqual({ eur: "incl. VAT", usd: "plus tax where applicable", pln: "incl. VAT" });
  });

  it("shows Lifetime only while the offer runs", () => {
    const config = { betaOpen: false, currency: "eur" as const, lifetimeOfferUntil: 1000 };
    expect(lifetimeOffered(config, 999)).toBe(true);
    expect(lifetimeOffered(config, 1000)).toBe(false);
    expect(lifetimeOffered({ ...config, lifetimeOfferUntil: null }, 0)).toBe(false);
    expect(lifetimeOffered(null, 0)).toBe(false);
    expect(plansOffered(config, 0)).toEqual(["monthly", "annual", "lifetime"]);
    expect(plansOffered(config, 2000)).toEqual(["monthly", "annual"]);
  });

  it("guards", () => {
    expect(isPlan("annual")).toBe(true);
    expect(isPlan("beta")).toBe(false);
    expect(isCurrency("pln")).toBe(true);
    expect(isCurrency("gbp")).toBe(false);
  });
});
