"use client";

import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { CASE_INFO } from "@/lib/cases";
import { renderPrompt, renderSolution } from "@/lib/generate";
import { spokenGap, speak, stopSpeaking, useSpeechAvailable } from "@/lib/speak";
import type { Verdict } from "@/lib/grade";
import type { Exercise } from "@/lib/types";

const VERDICT_STYLE: Record<Verdict, string> = {
  correct: "border-ok/40 bg-ok-soft text-ok",
  diacritics: "border-warn/40 bg-warn-soft text-warn",
  wrong: "border-accent/40 bg-accent-soft text-accent",
};

export function ExerciseCard({
  exercise,
  index,
  total,
  score,
  value,
  verdict,
  onChange,
  onSubmit,
  isLast,
  soundOn,
}: {
  exercise: Exercise;
  index: number;
  total: number;
  score: number;
  value: string;
  verdict: Verdict | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLast: boolean;
  soundOn: boolean;
}) {
  const canSpeak = useSpeechAvailable();
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (verdict) nextRef.current?.focus();
    else inputRef.current?.focus();
  }, [verdict, exercise.id]);

  // once the answer is revealed, read the complete sentence back
  useEffect(() => {
    if (verdict && soundOn) speak(renderSolution(exercise));
    return stopSpeaking;
  }, [verdict, exercise, soundOn]);

  const info = CASE_INFO[exercise.case];
  const answered = verdict !== null;
  const width = Math.max(9, value.length + 2);

  const gap = (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={answered}
      spellCheck={false}
      autoComplete="off"
      autoCapitalize="off"
      aria-label="Your answer"
      style={{ width: `${width}ch` }}
      className={`border-b-2 bg-transparent text-center outline-none transition-colors ${
        answered
          ? verdict === "correct"
            ? "border-ok text-ok"
            : "border-accent text-accent line-through decoration-1"
          : "border-accent/50 focus:border-accent"
      }`}
    />
  );

  const parts: ReactNode[] = [];
  let blankUsed = false;
  for (const [i, token] of exercise.tokens.entries()) {
    if (token.blank && blankUsed) continue;
    const space = parts.length > 0 ? " " : null;
    parts.push(
      <Fragment key={i}>
        {space}
        {token.blank ? gap : token.text}
      </Fragment>,
    );
    if (token.blank) blankUsed = true;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-sm text-muted">
          <span>
            {index + 1} / {total} · <span className="text-accent">{info.pl}</span>{" "}
            {exercise.number === "pl" ? "· plural" : "· singular"}
          </span>
          <span>
            {score} correct
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${((index + (answered ? 1 : 0)) / total) * 100}%` }}
          />
        </div>
      </div>

      <form
        className="rounded-2xl border border-line bg-surface p-6 sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <p className="sentence text-2xl leading-relaxed sm:text-3xl">
          {exercise.before}
          {parts}
          {exercise.after}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <p className="text-lg text-muted">({exercise.hint})</p>
          {canSpeak ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                speak(
                  answered ? renderSolution(exercise) : spokenGap(renderPrompt(exercise)),
                )
              }
              aria-label="Read the sentence aloud"
              title="Read the sentence aloud"
              className="rounded-lg border border-line px-2 py-1 text-sm text-muted hover:border-accent/50 hover:text-accent cursor-pointer"
            >
              🔈
            </button>
          ) : null}
        </div>
        <p className="mt-4 text-muted italic">&ldquo;{exercise.en}&rdquo;</p>

        {answered ? (
          <div className={`mt-6 rounded-xl border p-4 ${VERDICT_STYLE[verdict]}`} role="status">
            <p className="font-medium">
              {verdict === "correct"
                ? "✓ Dobrze!"
                : verdict === "diacritics"
                  ? `Almost — check the diacritics: ${exercise.answers[0]}`
                  : `✗ ${exercise.answers[0]}`}
            </p>
            {verdict !== "correct" ? (
              <p className="sentence mt-2 text-lg text-foreground">{renderSolution(exercise)}</p>
            ) : null}
            <p className="mt-2 text-sm text-muted">{exercise.note}</p>
          </div>
        ) : null}

        <button
          ref={nextRef}
          type="submit"
          className="mt-5 w-full rounded-xl bg-accent px-6 py-3 font-medium text-white cursor-pointer"
        >
          {answered ? (isLast ? "See results ↵" : "Next ↵") : "Check ↵"}
        </button>
      </form>
    </div>
  );
}
