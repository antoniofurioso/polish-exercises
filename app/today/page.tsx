import type { Metadata } from "next";
import { NOINDEX } from "@/lib/site";
import { TodayPage } from "./TodayClient";

export const metadata: Metadata = { title: "Today’s practice", robots: NOINDEX };

export default function Today() {
  return <TodayPage />;
}
