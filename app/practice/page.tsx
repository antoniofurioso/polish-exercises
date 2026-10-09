import type { Metadata } from "next";
import { Suspense } from "react";
import { NOINDEX } from "@/lib/site";
import { PracticePage } from "./PracticeClient";

export const metadata: Metadata = { title: "Practice", robots: NOINDEX };

export default function Practice() {
  return (
    <Suspense>
      <PracticePage />
    </Suspense>
  );
}
