import type { Metadata } from "next";
import { VerbsPage } from "./VerbsClient";

export const metadata: Metadata = { title: "Polish verbs practice" };

export default function Verbs() {
  return <VerbsPage />;
}
