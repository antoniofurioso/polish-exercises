"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { grade, normalise, stripDiacritics, type Verdict } from "@/lib/grade";
import { renderSolution } from "@/lib/generate";
import type { Exercise } from "@/lib/types";

/**
 * The landing page's live sample: a few multiple-choice questions built at
 * build time with fixed seeds (so the page stays static), answered here
 * without touching the learner's progress. The real drills use ExerciseCard.
 */
export function SampleQuestion({ exercises }: { exercises: Exercise[] }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const exercise = exercises[index];
  if (!exercise?.options) return null;

  const verdict: Verdict | null = picked === null ? null : grade(picked, exercise);
  const accepted = exercise.answers.map((a) => stripDiacritics(normalise(a)));
  const isLast = index + 1 >= exercises.length;

  // a blank over several words (adjective + noun) is one gap
  const firstBlank = exercise.tokens.findIndex((t) => t.blank);
  const sentence = exercise.tokens.map((token, i) => {
    const space = i > 0 ? " " : "";
    if (!token.blank) return <Fragment key={i}>{space + token.text}</Fragment>;
    if (i !== firstBlank) return null;
    return (
      <Fragment key={i}>
        {space}
        <span
          className={`inline-block min-w-[5ch] border-b-2 px-1 text-center ${
            verdict === null
              ? "border-accent/50 text-muted"
              : verdict === "correct"
                ? "border-ok text-ok"
                : "border-accent text-accent line-through decoration-1"
          }`}
        >
          {picked ?? "   "}
        </span>
        <span className="ml-1 text-base text-muted">({exercise.hint})</span>
      </Fragment>
    );
  });

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 sm:p-8">
      <div className="flex items-baseline justify-between text-sm text-muted">
        <span>Try one</span>
        <span>
          {index + 1} / {exercises.length}
        </span>
      </div>
      <p className="mt-3 italic text-muted">&ldquo;{exercise.en}&rdquo;</p>
      <p lang="pl" className="sentence mt-2 text-2xl leading-relaxed sm:text-3xl">
        {exercise.before}
        {sentence}
        {exercise.after}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {exercise.options.map((option) => {
          const isAnswer = accepted.includes(stripDiacritics(normalise(option)));
          const chosen = picked !== null && normalise(option) === normalise(picked);
          const style =
            picked === null
              ? "border-line bg-background hover:border-accent/60 cursor-pointer"
              : isAnswer
                ? "border-ok bg-ok-soft text-ok"
                : chosen
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line text-muted opacity-60";
          return (
            <button
              key={option}
              type="button"
              lang="pl"
              disabled={picked !== null}
              onClick={() => setPicked(option)}
              className={`sentence rounded-xl border px-4 py-3 text-left text-lg transition-colors ${style}`}
            >
              {option}
            </button>
          );
        })}
      </div>

      {verdict !== null ? (
        <div
          role="status"
          className={`mt-5 rounded-xl border p-4 ${
            verdict === "correct" ? "border-ok/40 bg-ok-soft text-ok" : "border-accent/40 bg-accent-soft text-accent"
          }`}
        >
          <p className="font-medium">
            {verdict === "correct" ? (
              <span lang="pl">✓ Dobrze!</span>
            ) : (
              <>
                ✗ <span lang="pl">{exercise.answers[0]}</span>
              </>
            )}
          </p>
          <p lang="pl" className="sentence mt-2 text-lg text-foreground">
            {renderSolution(exercise)}
          </p>
          <p className="mt-2 text-sm text-foreground">{exercise.note}</p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {!isLast ? (
              <button
                type="button"
                onClick={() => {
                  setIndex(index + 1);
                  setPicked(null);
                }}
                className="cursor-pointer rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-foreground hover:border-accent/50"
              >
                Next question
              </button>
            ) : null}
            <Link href="/today" className="text-sm font-medium text-accent underline underline-offset-4">
              Practise for real →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
