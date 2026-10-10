"use client";

import { Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ExerciseCard } from "@/components/ExerciseCard";
import { ResultsSummary, type Result } from "@/components/ResultsSummary";
import { track, trackGoal, type Source } from "@/lib/analytics";
import { grade, type Verdict } from "@/lib/grade";
import { streak, todayCount } from "@/lib/progress";
import { playFinish, playVerdict } from "@/lib/sound";
import { stopSpeaking } from "@/lib/speak";
import { dayKey } from "@/lib/srs";
import { readProgress, readSettings, recordAnswer, setSoundOn, useSoundOn } from "@/lib/storage";
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
  source = "practice",
}: {
  exercises: Exercise[];
  /** Recorded for exercises that do not name their own drill. */
  kind: ExerciseKind;
  /** Where "Quit" (the ✕) and the summary's home button lead. */
  home: string;
  onRestart: () => void;
  restartLabel?: string;
  homeLabel?: string;
  /** Ask a wrong exercise once more at the end of the session (today's practice). */
  reaskWrong?: boolean;
  /** Rendered above the results, e.g. the streak and goal after today's practice. */
  summaryExtra?: ReactNode;
  /** Where the session came from, for analytics only. */
  source?: Source;
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

  // analytics (lib/analytics.ts): a no-op without a key and consent
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    track("session_started", { source, drill: kind, size: initial.length });
  }, [source, kind, initial.length]);

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
      track("answer", { drill: exercise.kind ?? kind, verdict: result });
      trackGoal(() => {
        const now = Date.now();
        const progress = readProgress();
        const goal = readSettings().goal;
        return {
          answered: todayCount(progress, now).answered,
          goal,
          streak: streak(progress, goal, now).current,
          today: dayKey(now),
        };
      });
      if (soundOn) playVerdict(result);
      return;
    }
    setVerdict(null);
    setValue("");
    stopSpeaking();
    if (index + 1 >= exercises.length) {
      setDone(true);
      track("session_finished", { source, size: results.length, correct: score });
      if (soundOn) playFinish();
    } else {
      setIndex(index + 1);
    }
  };

  const retryMissed = () => {
    const missed = results.filter((r) => r.verdict !== "correct").map((r) => r.exercise);
    if (missed.length === 0) return;
    track("session_started", { source, drill: kind, size: missed.length });
    setExercises(missed);
    setReasks(new Set());
    setResults([]);
    setIndex(0);
    setValue("");
    setVerdict(null);
    setDone(false);
  };

  const finished = done || !exercise;
  const progressShare = finished ? 1 : (index + (verdict === null ? 0 : 1)) / exercises.length;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <header className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-4 sm:px-6 sm:py-6">
        <Link href={home} className="icon-btn" aria-label="Quit the session">
          <X size={20} aria-hidden="true" />
        </Link>
        <div
          role="progressbar"
          aria-label="Session progress"
          aria-valuemin={0}
          aria-valuemax={exercises.length}
          aria-valuenow={finished ? exercises.length : index}
          className="meter flex-1"
        >
          <span className="transition-[width] duration-300" style={{ width: `${progressShare * 100}%` }} />
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {finished ? exercises.length : index + 1} / {exercises.length}
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (soundOn) stopSpeaking();
            setSoundOn(!soundOn);
          }}
          aria-pressed={soundOn}
          aria-label="Sound"
          title={soundOn ? "Sound on" : "Sound off"}
          className="icon-btn"
        >
          {soundOn ? <Volume2 size={20} aria-hidden="true" /> : <VolumeX size={20} aria-hidden="true" />}
        </button>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-4 sm:px-6 sm:pt-10">
        {finished ? (
          <div className="space-y-6">
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
    </div>
  );
}
