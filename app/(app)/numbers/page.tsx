import type { Metadata } from "next";
import { NumbersPage } from "./NumbersClient";

export const metadata: Metadata = { title: "Polish numbers practice" };

export default function Numbers() {
  return <NumbersPage />;
}
