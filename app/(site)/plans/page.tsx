import type { Metadata } from "next";
import { Suspense } from "react";
import { BRAND } from "@/lib/brand";
import { NOINDEX, pageMetadata } from "@/lib/site";
import { PlansPage } from "./PlansClient";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Choose a plan",
    description: `${BRAND.name} plans: Monthly or Annual with a 3-day free trial.`,
    path: "/plans",
  }),
  robots: NOINDEX,
};

export default function Plans() {
  return (
    <Suspense>
      <PlansPage />
    </Suspense>
  );
}
