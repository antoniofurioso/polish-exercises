"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useTodayStatus } from "@/components/today";

/**
 * The landing page's call to action. The static HTML (and a first visit) says
 * "Start today’s practice"; once hydrated, a returning learner (anything in the
 * answer log's progress) sees "Continue — N due" instead. Both go to /today,
 * so a new visitor is one click from a session.
 */
export function StartButton({ className = "", inverse = false }: { className?: string; inverse?: boolean }) {
  const { hydrated, progress, due } = useTodayStatus();
  const returning = hydrated && Object.keys(progress.days).length > 0;

  const label = !returning ? "Start today’s practice" : due > 0 ? `Continue — ${due} due` : "Continue practising";

  return (
    <Link href="/today" className={`btn btn-lg ${inverse ? "btn-inverse" : "btn-primary"} ${className}`}>
      {label}
      <ArrowRight size={20} aria-hidden="true" />
    </Link>
  );
}
