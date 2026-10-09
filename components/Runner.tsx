"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ExerciseCard } from "@/components/ExerciseCard";
import { ResultsSummary, type Result } from "@/components/ResultsSummary";
import { grade, type Verdict } from "@/lib/grade";
import { playFinish, playVerdict } from "@/lib/sound";
import { stopSpeaking } from "@/lib/speak";
import { recordAnswer, setSoundOn, useSoundOn } from "@/lib/storage";
import type { Exercise, ExerciseKind } from "@/lib/types";

/**
 * Runs a prebuilt list of exercises: grades, records every answer, then shows
 * the results. Shared by /practice (exercises from the URL) and /today
 * (exercises from the scheduler).
 */
export function Runner({
  exercises: initial,
  kind,
  home,
  onRestart,
  restartLabel,
  homeLabel,
  reaskWrong = false,
  summaryExtra,
}: {
  exercises: Exercise[];
  /** Recorded for exercises that do not name their own drill. */
  kind: ExerciseKind;
  /** Where "Ćwiczenia", "Quit" and the summary's home button lead. */
  home: string;
  onRestart: () => void;
  restartLabel?: string;
  homeLabel?: string;
  /** Ask a wrong exercise once more at the end of the session (today's practice). */
  reaskWrong?: boolean;
  /** Rendered above the results, e.g. the streak and goal after today's practice. */
  summaryExtra?: ReactNode;
}) {
  const [exercises, setExercises] = useState<Exercise[]>(initial);
  /** Indexes of exercises that are a re-ask: answered and recorded, but not scored twice. */
  const [reasks, setReasks] = useState<ReadonlySet<number>>(() => new Set());
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [done, setDone] = useState(false);
  const soundOn = useSoundOn();

  const exercise = exercises[index];
  const score = results.filter((r) => r.verdict === "correct").length;

  const submit = (answer: string = value) => {
    if (!exercise) return;
    if (verdict === null) {
      const result = grade(answer, exercise);
      setValue(answer);
      setVerdict(result);
      const isReask = reasks.has(index);
      if (!isReask) setResults((r) => [...r, { exercise, verdict: result }]);
      if (reaskWrong && !isReask && result === "wrong") {
        setReasks((s) => new Set(s).add(exercises.length));
        setExercises((list) => [...list, exercise]);
      }
      recordAnswer(exercise, exercise.kind ?? kind, result, answer);
      if (soundOn) playVerdict(result);
      return;
    }
    setVerdict(null);
    setValue("");
    stopSpeaking();
    if (index + 1 >= exercises.length) {
      setDone(true);
      if (soundOn) playFinish();
    } else {
      setIndex(index + 1);
    }
  };

  const retryMissed = () => {
    const missed = results.filter((r) => r.verdict !== "correct").map((r) => r.exercise);
    if (missed.length === 0) return;
    setExercises(missed);
    setReasks(new Set());
    setResults([]);
    setIndex(0);
    setValue("");
    setVerdict(null);
    setDone(false);
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-14">
      <div className="mb-8 flex items-center justify-between">
        <Link href={home} className="text-sm uppercase tracking-[0.2em] text-accent">
          Ćwiczenia
        </Link>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (soundOn) stopSpeaking();
              setSoundOn(!soundOn);
            }}
            aria-pressed={soundOn}
            aria-label={soundOn ? "Turn sound off" : "Turn sound on"}
            title={soundOn ? "Sound on" : "Sound off"}
            className="text-sm text-muted hover:text-accent cursor-pointer"
          >
            {soundOn ? "🔊" : "🔇"}
          </button>
          <Link href={home} className="text-sm text-muted underline underline-offset-4">
            Quit
          </Link>
        </div>
      </div>

      {done || !exercise ? (
        <div className="space-y-8">
          {summaryExtra}
          <ResultsSummary
            results={results}
            onRetryMissed={retryMissed}
            onRestart={onRestart}
            home={home}
            restartLabel={restartLabel}
            homeLabel={homeLabel}
          />
        </div>
      ) : (
        <ExerciseCard
          exercise={exercise}
          index={index}
          total={exercises.length}
          score={score}
          value={value}
          verdict={verdict}
          onChange={setValue}
          onSubmit={submit}
          isLast={index + 1 >= exercises.length}
          soundOn={soundOn}
        />
      )}
    </main>
  );
}
