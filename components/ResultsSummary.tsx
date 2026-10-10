"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { InstallCard } from "@/components/InstallCard";
import { CASE_INFO } from "@/lib/cases";
import { renderPrompt, renderSolution } from "@/lib/generate";
import type { Verdict } from "@/lib/grade";
import type { Exercise } from "@/lib/types";

export type Result = { exercise: Exercise; verdict: Verdict };

export function ResultsSummary({
  results,
  onRetryMissed,
  onRestart,
  home = "/learn",
  restartLabel = "New sentences, same settings",
  homeLabel = "Change settings",
}: {
  results: Result[];
  onRetryMissed: () => void;
  onRestart: () => void;
  home?: string;
  restartLabel?: string;
  homeLabel?: string;
}) {
  const correct = results.filter((r) => r.verdict === "correct").length;
  const missed = results.filter((r) => r.verdict !== "correct");
  const percent = results.length ? Math.round((correct / results.length) * 100) : 0;

  // drills that are not about a case (tenses, spelling, dates) group by their label
  const groupOf = (ex: Exercise) => ex.label ?? CASE_INFO[ex.case].pl;
  const byGroup = new Map<string, { correct: number; total: number }>();
  for (const { exercise, verdict } of results) {
    const key = groupOf(exercise);
    const entry = byGroup.get(key) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (verdict === "correct") entry.correct += 1;
    byGroup.set(key, entry);
  }

  return (
    <div className="space-y-6">
      <div className="card flex flex-col items-center px-6 py-10 text-center">
        <p lang="pl" className="eyebrow">
          Koniec
        </p>
        <p className="mt-3 text-6xl font-bold tracking-tight text-accent">{percent}%</p>
        <p className="mt-2 text-muted">
          {correct} of {results.length} right
        </p>
      </div>

      <InstallCard />

      {byGroup.size > 0 ? (
        <section aria-label="By topic" className="card space-y-3 p-6">
          {[...byGroup.entries()].map(([group, stat]) => (
            <div key={group} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0 truncate font-medium sm:w-44">{group}</span>
              <div className="meter flex-1" aria-hidden="true">
                <span style={{ width: `${(stat.correct / stat.total) * 100}%` }} />
              </div>
              <span className="w-12 shrink-0 text-right text-muted tabular-nums">
                {stat.correct}/{stat.total}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      {missed.length > 0 ? (
        <section aria-labelledby="review-title" className="space-y-3">
          <h2 id="review-title" className="label-caps">
            To review ({missed.length})
          </h2>
          <ul className="space-y-2.5">
            {missed.map(({ exercise }, i) => (
              <li key={`${exercise.id}-${i}`} className="card px-5 py-4">
                <p lang="pl" className="sentence text-lg">
                  {renderSolution(exercise)}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  <span lang="pl">
                    {renderPrompt(exercise)} ({exercise.hint})
                  </span>{" "}
                  · {groupOf(exercise)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        {missed.length > 0 ? (
          <button type="button" onClick={onRetryMissed} className="btn btn-primary flex-1">
            <RotateCcw size={18} aria-hidden="true" />
            Practise the {missed.length} missed
          </button>
        ) : null}
        <button type="button" onClick={onRestart} className="btn btn-secondary flex-1">
          {restartLabel}
        </button>
        <Link href={home} className="btn btn-secondary flex-1">
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
