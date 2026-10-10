import type { Metadata } from "next";
import { Suspense } from "react";
import { NOINDEX } from "@/lib/site";
import { BillingPage } from "./BillingClient";

export const metadata: Metadata = { title: "Billing", robots: NOINDEX };

export default function Billing() {
  return (
    <Suspense>
      <BillingPage />
    </Suspense>
  );
}
