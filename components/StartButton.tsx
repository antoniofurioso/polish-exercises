"use client";

import Link from "next/link";
import { useTodayStatus } from "@/components/today";

/**
 * The landing page's call to action. The static HTML (and a first visit) says
 * "Start practising"; once hydrated, a returning learner (anything in the
 * answer log's progress) sees "Continue — N due" instead. Both go to /today,
 * so a new visitor is one click from a session.
 */
export function StartButton({ className = "" }: { className?: string }) {
  const { hydrated, progress, due } = useTodayStatus();
  const returning = hydrated && Object.keys(progress.days).length > 0;

  const label = !returning ? "Start practising" : due > 0 ? `Continue — ${due} due` : "Continue practising";
  const sub = !returning
    ? "No sign-up. A short mixed session, picked for you."
    : due > 0
      ? "Your reviews for today are waiting."
      : "Nothing due: new words and your weak spots.";

  return (
    <div className={className}>
      <Link
        href="/today"
        className="inline-flex items-center justify-center rounded-xl bg-accent px-7 py-4 text-lg font-medium text-white transition-opacity hover:opacity-90"
      >
        {label} →
      </Link>
      <p className="mt-2 text-sm text-muted">{sub}</p>
    </div>
  );
}
