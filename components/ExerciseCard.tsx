"use client";

import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { CASE_INFO } from "@/lib/cases";
import { explainMiss } from "@/lib/diagnose";
import { renderPrompt, renderSolution } from "@/lib/generate";
import { spokenGap, speak, stopSpeaking, useSpeechAvailable } from "@/lib/speak";
import { normalise, stripDiacritics, type Verdict } from "@/lib/grade";
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
  onSubmit: (answer?: string) => void;
  isLast: boolean;
  soundOn: boolean;
}) {
  const canSpeak = useSpeechAvailable();
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const options = exercise.options;

  useEffect(() => {
    if (verdict) nextRef.current?.focus();
    else if (!options) inputRef.current?.focus();
  }, [verdict, exercise.id, options]);

  // in multiple choice the number keys pick an option
  useEffect(() => {
    if (!options || verdict) return;
    const onKey = (e: KeyboardEvent) => {
      // a bare number picks an option; ⌘1 / ctrl+1 stay the browser's
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (!n || n > options.length) return;
      e.preventDefault();
      onSubmit(options[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, verdict, onSubmit]);

  // once the answer is revealed, read the complete sentence back
  useEffect(() => {
    if (verdict && soundOn) speak(renderSolution(exercise));
    return stopSpeaking;
  }, [verdict, exercise, soundOn]);

  const info = CASE_INFO[exercise.case];
  const answered = verdict !== null;
  // accents get their own one-liner already; every other miss gets explained
  const explanation = verdict === "wrong" ? explainMiss(value, exercise) : null;
  const width = Math.max(9, value.length + 2);
  const accepted = exercise.answers.map((a) => stripDiacritics(normalise(a)));

  const slot = (
    <span
      className={`inline-block min-w-[6ch] border-b-2 px-1 text-center transition-colors ${
        answered
          ? verdict === "correct"
            ? "border-ok text-ok"
            : "border-accent text-accent line-through decoration-1"
          : "border-accent/50 text-muted"
      }`}
    >
      {value || "\u00a0\u00a0\u00a0"}
    </span>
  );

  const gap = options ? (
    slot
  ) : (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={answered}
      spellCheck={false}
      type="text"
      name="answer"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      inputMode="text"
      data-lpignore="true"
      data-1p-ignore=""
      data-bwignore="true"
      data-form-type="other"
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

  const gapWithHint = (
    <span className="whitespace-nowrap">
      {gap}
      <span className="ml-1 text-lg text-muted">({exercise.hint})</span>
    </span>
  );

  const parts: ReactNode[] = [];
  let blankUsed = false;
  for (const [i, token] of exercise.tokens.entries()) {
    if (token.blank && blankUsed) continue;
    const space = parts.length > 0 ? " " : null;
    parts.push(
      <Fragment key={i}>
        {space}
        {token.blank ? gapWithHint : token.text}
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
        <p className="mb-3 text-muted italic">&ldquo;{exercise.en}&rdquo;</p>
        <p className="sentence text-2xl leading-relaxed sm:text-3xl">
          {exercise.before}
          {parts}
          {exercise.after}
        </p>
        <div className="mt-3 flex items-center gap-3">
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

        {options ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {options.map((option, i) => {
              const isAnswer = accepted.includes(stripDiacritics(normalise(option)));
              const chosen = answered && normalise(option) === normalise(value);
              const style = !answered
                ? "border-line bg-background hover:border-accent/60"
                : isAnswer
                  ? "border-ok bg-ok-soft text-ok"
                  : chosen
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line text-muted opacity-60";
              return (
                <button
                  key={option}
                  type="button"
                  disabled={answered}
                  onClick={() => onSubmit(option)}
                  className={`sentence flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-lg transition-colors ${style} ${
                    answered ? "cursor-default" : "cursor-pointer"
                  }`}
                >
                  <span className="text-xs text-muted tabular-nums">{i + 1}</span>
                  <span>{option}</span>
                </button>
              );
            })}
          </div>
        ) : null}

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
            {explanation ? (
              <p className="mt-2 text-sm text-foreground">{explanation}</p>
            ) : null}
            <p className="mt-2 text-sm text-muted">{exercise.note}</p>
          </div>
        ) : null}

        {answered || !options ? (
          <button
            ref={nextRef}
            type="submit"
            className="mt-5 w-full rounded-xl bg-accent px-6 py-3 font-medium text-white cursor-pointer"
          >
            {answered ? (isLast ? "See results ↵" : "Next ↵") : "Check ↵"}
          </button>
        ) : null}
      </form>
    </div>
  );
}
