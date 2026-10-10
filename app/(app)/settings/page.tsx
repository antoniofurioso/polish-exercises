import type { Metadata } from "next";
import { NOINDEX } from "@/lib/site";
import { SettingsPage } from "./SettingsClient";

export const metadata: Metadata = { title: "Settings", robots: NOINDEX };

export default function Settings() {
  return <SettingsPage />;
}
