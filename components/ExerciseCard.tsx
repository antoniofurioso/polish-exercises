"use client";

import { ArrowRight, Check, Lightbulb, TriangleAlert, Volume2, X } from "lucide-react";
import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { CASE_INFO } from "@/lib/cases";
import { explainMiss } from "@/lib/diagnose";
import { renderPrompt, renderSolution } from "@/lib/generate";
import { spokenGap, speak, stopSpeaking, useSpeechAvailable } from "@/lib/speak";
import { normalise, stripDiacritics, type Verdict } from "@/lib/grade";
import type { Exercise } from "@/lib/types";

/** Letters a non-Polish keyboard lacks; tapping one types it into the answer. */
const POLISH_LETTERS = ["ą", "ć", "ę", "ł", "ń", "ó", "ś", "ź", "ż"];

const VERDICT_STYLE: Record<Verdict, { panel: string; ink: string; icon: ReactNode }> = {
  correct: { panel: "border-ok-line bg-ok-soft", ink: "text-ok", icon: <Check size={20} aria-hidden="true" /> },
  diacritics: { panel: "border-warn/40 bg-warn-soft", ink: "text-warn", icon: <TriangleAlert size={20} aria-hidden="true" /> },
  wrong: { panel: "border-accent-line bg-accent-soft", ink: "text-accent-strong", icon: <X size={20} aria-hidden="true" /> },
};

/** One question: the sentence with its gap, the answer (typed or picked), then the verdict and the rule. */
export function ExerciseCard({
  exercise,
  score,
  value,
  verdict,
  onChange,
  onSubmit,
  isLast,
  soundOn,
}: {
  exercise: Exercise;
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
  const width = Math.max(7, value.length + 2);
  const accepted = exercise.answers.map((a) => stripDiacritics(normalise(a)));
  const gapStyle = answered
    ? verdict === "correct"
      ? "border-ok text-ok"
      : "border-accent text-accent-strong line-through decoration-1"
    : "border-accent";

  const gap = options ? (
    <span className={`inline-block min-w-[5ch] border-b-[3px] px-1 text-center transition-colors ${gapStyle}`}>
      {value || "   "}
    </span>
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
      className={`rounded-t-md border-b-[3px] bg-transparent px-1 text-center outline-none transition-colors focus:bg-accent-soft ${gapStyle}`}
    />
  );

  const gapWithHint = (
    <span className="whitespace-nowrap">
      {gap}
      <span className="ml-1.5 font-sans text-lg text-muted">({exercise.hint})</span>
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

  const style = verdict ? VERDICT_STYLE[verdict] : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span lang={exercise.label ? undefined : "pl"} className="chip chip-accent">
          {exercise.label ?? info.pl}
        </span>
        {exercise.label ? null : <span className="chip">{exercise.number === "pl" ? "Plural" : "Singular"}</span>}
        <span className="chip ml-auto">
          <Check size={14} aria-hidden="true" />
          {score} right
        </span>
      </div>

      <p className="mt-8 text-lg italic text-muted">&ldquo;{exercise.en}&rdquo;</p>
      <p lang="pl" className="sentence mt-3 text-[2rem] leading-snug sm:text-[2.75rem] sm:leading-tight">
        {exercise.before}
        {parts}
        {exercise.after}
      </p>

      {canSpeak ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => speak(answered ? renderSolution(exercise) : spokenGap(renderPrompt(exercise)))}
          className="btn btn-secondary btn-sm mt-5"
        >
          <Volume2 size={16} aria-hidden="true" />
          Listen
        </button>
      ) : null}

      {options ? (
        <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
          {options.map((option, i) => {
            const isAnswer = accepted.includes(stripDiacritics(normalise(option)));
            const chosen = answered && normalise(option) === normalise(value);
            const tone = !answered
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
                disabled={answered}
                onClick={() => onSubmit(option)}
                className={`flex min-h-14 items-center gap-3.5 rounded-xl border px-4 py-3 text-left transition-colors ${tone} ${
                  answered ? "cursor-default" : "cursor-pointer"
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-chip font-sans text-xs font-semibold text-muted tabular-nums">
                  {i + 1}
                </span>
                <span className="sentence text-xl">{option}</span>
              </button>
            );
          })}
        </div>
      ) : !answered ? (
        <div className="mt-8 flex flex-wrap gap-1.5" role="group" aria-label="Polish letters">
          {POLISH_LETTERS.map((letter) => (
            <button
              key={letter}
              type="button"
              lang="pl"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(value + letter);
                inputRef.current?.focus();
              }}
              aria-label={`Type ${letter}`}
              className="sentence h-11 min-w-11 cursor-pointer rounded-[0.625rem] border border-line-strong bg-subtle text-lg hover:border-accent hover:text-accent"
            >
              {letter}
            </button>
          ))}
        </div>
      ) : null}

      {answered && style ? (
        <section role="status" className={`mt-8 rounded-[1.25rem] border px-5 py-5 sm:px-6 ${style.panel}`}>
          <p className={`flex items-center gap-2 text-[1.0625rem] font-bold ${style.ink}`}>
            {style.icon}
            {verdict === "correct" ? (
              <span>
                <span lang="pl">Dobrze!</span> That’s right.
              </span>
            ) : verdict === "diacritics" ? (
              <span>
                Almost: check the accents, <span lang="pl">{exercise.answers[0]}</span>
              </span>
            ) : (
              <span>
                The answer is <span lang="pl">{exercise.answers[0]}</span>
              </span>
            )}
          </p>
          <p lang="pl" className="sentence mt-2 text-2xl">
            {renderSolution(exercise)}
          </p>
          {explanation ? <p className="mt-2 text-[0.9375rem] text-foreground">{explanation}</p> : null}
          <div className="mt-4 flex gap-3 border-t border-foreground/10 pt-4">
            <Lightbulb size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            <p className="text-[0.9375rem] text-foreground-soft">{exercise.note}</p>
          </div>
        </section>
      ) : null}

      {answered || !options ? (
        <div className="mt-8 flex flex-wrap items-center justify-end gap-4">
          <span className="hidden text-[0.8125rem] text-muted sm:inline">Press Enter ↵</span>
          <button ref={nextRef} type="submit" className="btn btn-primary btn-lg w-full sm:w-auto">
            {answered ? (isLast ? "See results" : "Next question") : "Check"}
            {answered ? <ArrowRight size={20} aria-hidden="true" /> : null}
          </button>
        </div>
      ) : null}
    </form>
  );
}
