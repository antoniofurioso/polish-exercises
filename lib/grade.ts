import type { Exercise } from "./types";

export type Verdict = "correct" | "diacritics" | "wrong";

const DIACRITICS: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
};

export function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,!?;:]+$/g, "")
    .trim();
}

export function stripDiacritics(input: string): string {
  return input.replace(/[ąćęłńóśźż]/g, (ch) => DIACRITICS[ch] ?? ch);
}

export function grade(input: string, exercise: Exercise): Verdict {
  const answer = normalise(input);
  if (!answer) return "wrong";
  const accepted = exercise.answers.map(normalise);
  if (accepted.includes(answer)) return "correct";
  const loose = stripDiacritics(answer);
  if (accepted.some((a) => stripDiacritics(a) === loose)) return "diacritics";
  return "wrong";
}
