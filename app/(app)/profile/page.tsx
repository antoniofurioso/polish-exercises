import type { Metadata } from "next";
import { NOINDEX } from "@/lib/site";
import { ProfilePage } from "./ProfileClient";

export const metadata: Metadata = { title: "Profile", robots: NOINDEX };

export default function Profile() {
  return <ProfilePage />;
}
