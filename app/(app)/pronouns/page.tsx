import type { Metadata } from "next";
import { PronounsPage } from "./PronounsClient";

export const metadata: Metadata = { title: "Demonstrative pronouns practice" };

export default function Pronouns() {
  return <PronounsPage />;
}
