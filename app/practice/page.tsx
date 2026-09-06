import { redirect } from "next/navigation";
import { PracticeClient } from "./PracticeClient";
import { CASES } from "@/lib/types";
import type { Case, Config, GramNumber, WordMode } from "@/lib/types";

const MODES: WordMode[] = ["nouns", "adjectives", "both"];

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function PracticePage({ searchParams }: PageProps<"/practice">) {
  const params = await searchParams;

  const cases = first(params.cases)
    .split(",")
    .filter((c): c is Case => (CASES as readonly string[]).includes(c));
  if (cases.length === 0) redirect("/");

  const numbers = first(params.num)
    .split(",")
    .filter((n): n is GramNumber => n === "sg" || n === "pl");
  const modeParam = first(params.mode) as WordMode;
  const count = Number(first(params.count));
  const seed = Number(first(params.seed)) || 1;

  const config: Config = {
    cases,
    numbers: numbers.length ? numbers : ["sg"],
    mode: MODES.includes(modeParam) ? modeParam : "nouns",
    count: Number.isFinite(count) ? Math.min(200, Math.max(1, Math.round(count))) : 20,
  };

  return <PracticeClient key={seed} config={config} seed={seed} />;
}
