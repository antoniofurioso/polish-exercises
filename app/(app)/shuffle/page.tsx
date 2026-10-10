import type { Metadata } from "next";
import { ShufflePage } from "./ShuffleClient";

export const metadata: Metadata = { title: "Shuffle practice" };

export default function Shuffle() {
  return <ShufflePage />;
}
