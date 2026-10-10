import type { Metadata } from "next";
import { CasesPage } from "./CasesClient";

export const metadata: Metadata = { title: "Polish case practice" };

export default function Cases() {
  return <CasesPage />;
}
