import type { Metadata } from "next";
import { PossessivesPage } from "./PossessivesClient";

export const metadata: Metadata = { title: "Possessive pronouns practice" };

export default function Possessives() {
  return <PossessivesPage />;
}
