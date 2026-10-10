import { Check, CreditCard, Mail, Receipt } from "lucide-react";
import type { Metadata } from "next";
import { AccountTabs } from "@/components/AccountTabs";
import { AppPage } from "@/components/AppShell";
import { BRAND } from "@/lib/brand";
import { NOINDEX } from "@/lib/site";

export const metadata: Metadata = { title: "Billing", robots: NOINDEX };

const BETA = ["All six drills and the grammar guides", "Today’s practice with spaced repetition", "Progress saved on this device"];
const PRO = ["Everything in the beta", "An account, with your progress on every device"];

/**
 * The plan. There are no accounts or payments yet (plans/ROADMAP.md, Phase 4):
 * everyone is on the free beta, and this page says so. Payment method and
 * invoices are laid out empty, ready for the merchant of record.
 */
export default function Billing() {
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
