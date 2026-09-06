"use client";

import Link from "next/link";
import { CASE_INFO } from "@/lib/cases";
import { renderPrompt, renderSolution } from "@/lib/generate";
import type { Verdict } from "@/lib/grade";
import type { Case, Exercise } from "@/lib/types";

export type Result = { exercise: Exercise; verdict: Verdict };

export function ResultsSummary({
  results,
  onRetryMissed,
  onRestart,
}: {
  results: Result[];
  onRetryMissed: () => void;
  onRestart: () => void;
}) {
  const correct = results.filter((r) => r.verdict === "correct").length;
  const missed = results.filter((r) => r.verdict !== "correct");
  const percent = results.length ? Math.round((correct / results.length) * 100) : 0;

  const byCase = new Map<Case, { correct: number; total: number }>();
  for (const { exercise, verdict } of results) {
    const entry = byCase.get(exercise.case) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (verdict === "correct") entry.correct += 1;
    byCase.set(exercise.case, entry);
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-line bg-surface p-8 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-muted">Koniec</p>
        <p className="mt-3 text-5xl font-semibold text-accent">{percent}%</p>
        <p className="mt-2 text-muted">
          {correct} of {results.length} correct
        </p>
      </div>

      <div className="space-y-2">
        {[...byCase.entries()].map(([kase, stat]) => (
          <div key={kase} className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0 text-muted">{CASE_INFO[kase].pl}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full bg-accent"
                style={{ width: `${(stat.correct / stat.total) * 100}%` }}
              />
            </div>
            <span className="w-14 shrink-0 text-right text-muted">
              {stat.correct}/{stat.total}
            </span>
          </div>
        ))}
      </div>

      {missed.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            To review ({missed.length})
          </h2>
          <ul className="space-y-3">
            {missed.map(({ exercise }, i) => (
              <li key={`${exercise.id}-${i}`} className="rounded-xl border border-line bg-surface p-4">
                <p className="sentence text-lg">{renderSolution(exercise)}</p>
                <p className="text-sm text-muted">
                  {renderPrompt(exercise)} ({exercise.hint}) · {CASE_INFO[exercise.case].pl}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        {missed.length > 0 ? (
          <button
            type="button"
            onClick={onRetryMissed}
            className="flex-1 rounded-xl bg-accent px-6 py-3 font-medium text-white cursor-pointer"
          >
            Practise the {missed.length} missed
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRestart}
          className="flex-1 rounded-xl border border-line bg-surface px-6 py-3 font-medium cursor-pointer hover:border-accent/50"
        >
          New sentences, same settings
        </button>
        <Link
          href="/"
          className="flex-1 rounded-xl border border-line bg-surface px-6 py-3 text-center font-medium hover:border-accent/50"
        >
          Change settings
        </Link>
      </div>
    </div>
  );
}
