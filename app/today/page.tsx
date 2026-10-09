import type { Metadata } from "next";
import { TodayPage } from "./TodayClient";

export const metadata: Metadata = { title: "Today’s practice · Ćwiczenia" };

export default function Today() {
  return <TodayPage />;
}
