"use client";

import { ArrowRight, Check, X } from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";
import { CASE_INFO } from "@/lib/cases";
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
  const right = verdict === "correct";
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
          className={`inline-block min-w-[4ch] border-b-2 px-1 text-center ${
            verdict === null ? "border-accent" : right ? "border-ok text-ok" : "border-accent text-accent-strong line-through decoration-1"
          }`}
        >
          {picked ?? " "}
        </span>{" "}
        <span className="font-sans text-base text-muted sm:text-lg">({exercise.hint})</span>
      </Fragment>
    );
  });

  return (
    <div className="card card-raised relative p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3 text-[0.8125rem] text-muted">
        <span className="eyebrow">Try one</span>
        <span>
          {exercise.label ?? CASE_INFO[exercise.case].en} · {index + 1} of {exercises.length}
        </span>
      </div>
      <p className="mt-5 italic text-muted">&ldquo;{exercise.en}&rdquo;</p>
      <p lang="pl" className="sentence mt-2 text-[1.75rem] leading-snug sm:text-[2rem]">
        {exercise.before}
        {sentence}
        {exercise.after}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {exercise.options.map((option) => {
          const isAnswer = accepted.includes(stripDiacritics(normalise(option)));
          const chosen = picked !== null && normalise(option) === normalise(picked);
          const style =
            picked === null
              ? "border-line-strong bg-surface hover:border-accent"
              : isAnswer
                ? "border-ok bg-ok-soft text-ok"
                : chosen
                  ? "border-accent bg-accent-soft text-accent-strong"
                  : "border-line-strong opacity-45";
          return (
            <button
              key={option}
              type="button"
              lang="pl"
              disabled={picked !== null}
              onClick={() => setPicked(option)}
              className={`sentence min-h-13 min-w-0 rounded-xl border px-4 py-3 text-left text-lg [overflow-wrap:anywhere] transition-colors sm:text-xl ${style} ${
                picked === null ? "cursor-pointer" : "cursor-default"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>

      {verdict !== null ? (
        <div
          role="status"
          className={`mt-5 rounded-2xl border px-5 py-4 ${right ? "border-ok-line bg-ok-soft" : "border-accent-line bg-accent-soft"}`}
        >
          <p className={`flex items-center gap-2 font-semibold ${right ? "text-ok" : "text-accent-strong"}`}>
            {right ? <Check size={18} aria-hidden="true" /> : <X size={18} aria-hidden="true" />}
            {right ? (
              <span>
                <span lang="pl">Dobrze!</span> That’s right.
              </span>
            ) : (
              <span>
                Not quite: <span lang="pl">{exercise.answers[0]}</span>
              </span>
            )}
          </p>
          <p lang="pl" className="sentence mt-1.5 text-lg">
            {renderSolution(exercise)}
          </p>
          <p className="mt-1.5 text-sm text-foreground-soft">{exercise.note}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {!isLast ? (
              <button
                type="button"
                onClick={() => {
                  setIndex(index + 1);
                  setPicked(null);
                }}
                className="btn btn-secondary btn-sm"
              >
                Next question
              </button>
            ) : null}
            <Link href="/today" className="link inline-flex items-center gap-1.5 text-sm">
              Practise for real <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
