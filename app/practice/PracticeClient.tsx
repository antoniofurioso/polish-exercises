"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ExerciseCard } from "@/components/ExerciseCard";
import { ResultsSummary, type Result } from "@/components/ResultsSummary";
import { buildSession } from "@/lib/generate";
import { grade, type Verdict } from "@/lib/grade";
import { playFinish, playVerdict } from "@/lib/sound";
import { stopSpeaking } from "@/lib/speak";
import { parseSession, randomSeed, sessionParams } from "@/lib/session";
import { recordAnswer, setSoundOn, useSoundOn } from "@/lib/storage";
import type { Config, Exercise } from "@/lib/types";

/**
 * The session lives entirely in the query string, read on the client so the
 * whole app can be exported as static files.
 */
export function PracticePage() {
  const params = useSearchParams();
  const session = useMemo(() => parseSession(new URLSearchParams(params.toString())), [params]);

  if (!session) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 py-20 text-center">
        <p className="text-muted">This practice link has no settings in it.</p>
        <Link href="/" className="mt-4 inline-block text-accent underline underline-offset-4">
          Set up a session
        </Link>
      </main>
    );
  }

  // a new seed means a new set of sentences, so start the runner from scratch
  return <Runner key={session.seed} config={session.config} seed={session.seed} />;
}

function Runner({ config, seed }: { config: Config; seed: number }) {
  const router = useRouter();
  const initial = useMemo(() => buildSession(config, seed), [config, seed]);

  const [exercises, setExercises] = useState<Exercise[]>(initial);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [done, setDone] = useState(false);
  const soundOn = useSoundOn();

  const exercise = exercises[index];
  const score = results.filter((r) => r.verdict === "correct").length;

  const submit = () => {
    if (!exercise) return;
    if (verdict === null) {
      const result = grade(value, exercise);
      setVerdict(result);
      setResults((r) => [...r, { exercise, verdict: result }]);
      recordAnswer(exercise.case, result === "correct");
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
    setResults([]);
    setIndex(0);
    setValue("");
    setVerdict(null);
    setDone(false);
  };

  const restart = () => router.push(`/practice?${sessionParams(config, randomSeed())}`);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-14">
      <div className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-sm uppercase tracking-[0.2em] text-accent">
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
          <Link href="/" className="text-sm text-muted underline underline-offset-4">
            Quit
          </Link>
        </div>
      </div>

      {done || !exercise ? (
        <ResultsSummary results={results} onRetryMissed={retryMissed} onRestart={restart} />
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
