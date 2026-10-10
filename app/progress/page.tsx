import type { Metadata } from "next";
import { ProgressPage } from "./ProgressClient";

export const metadata: Metadata = { title: "Your progress" };

export default function Progress() {
  return <ProgressPage />;
}
