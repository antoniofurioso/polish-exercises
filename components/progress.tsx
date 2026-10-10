"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { WeakSpot } from "@/lib/progress";
import { missLabel, skillHref } from "@/lib/progressView";
import { randomSeed } from "@/lib/session";

/** Building blocks of the home dashboard (/learn) and /progress. */

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** How full a day's square is: nothing, a start, most of the way, goal met. */
const TONES = ["bg-chip", "bg-accent-line", "bg-accent opacity-55", "bg-accent-fill"];
const toneOf = (answered: number, goal: number) =>
  answered === 0 ? 0 : answered >= goal ? 3 : answered >= goal / 2 ? 2 : 1;

/** The last weeks as a Monday-first grid, one square per day, darker the closer to the goal. */
export function ActivityGrid({ days, goal }: { days: { day: string; answered: number }[]; goal: number }) {
  const pad = days.length > 0 ? (new Date(`${days[0].day}T00:00`).getDay() + 6) % 7 : 0;
  const met = days.filter((d) => d.answered >= goal).length;
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[0.6875rem] text-muted" aria-hidden="true">
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-7 gap-1.5" aria-label={`Goal met on ${met} of the last ${days.length} days`}>
        {Array.from({ length: pad }, (_, i) => (
          <li key={`pad-${i}`} aria-hidden="true" />
        ))}
        {days.map(({ day, answered }, i) => (
          <li
            key={day}
            title={`${day}: ${answered} answered`}
            aria-label={`${day}: ${answered} answered`}
            className={`aspect-square rounded-lg ${TONES[toneOf(answered, goal)]} ${
              i === days.length - 1 ? "ring-2 ring-foreground/40 ring-offset-2 ring-offset-surface" : ""
            }`}
          />
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-end gap-1.5 text-xs text-muted" aria-hidden="true">
        Less
        {TONES.map((tone) => (
          <span key={tone} className={`h-3.5 w-3.5 rounded ${tone}`} />
        ))}
        Goal met
      </div>
    </div>
  );
}

/** One number with its label and an icon. */
export function StatCard({
  label,
  icon,
  value,
  unit,
  detail,
  children,
}: {
  label: string;
  icon: ReactNode;
  value: ReactNode;
  unit?: string;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between text-[0.8125rem] font-medium text-muted">
        {label}
        <span className="text-accent">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight">
        {value}
        {unit ? <span className="ml-1.5 text-[0.9375rem] font-medium text-muted">{unit}</span> : null}
      </p>
      {detail ? <p className="mt-1 text-[0.8125rem] text-muted">{detail}</p> : null}
      {children}
    </div>
  );
}

/** The weak spots, each with its accuracy, its usual mistakes and a configured session. */
export function WeakSpotList({ spots, detailed = false }: { spots: WeakSpot[]; detailed?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {spots.map((spot) => (
        <WeakSpotRow key={spot.skill} spot={spot} detailed={detailed} />
      ))}
    </ul>
  );
}

function WeakSpotRow({ spot, detailed }: { spot: WeakSpot; detailed: boolean }) {
  // the seed is picked once per row so the link is stable across re-renders
  const [seed] = useState(randomSeed);
  const href = skillHref(spot.skill, seed);
  const percent = spot.total ? Math.round((spot.correct / spot.total) * 100) : 0;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{spot.label}</p>
        <p className="text-[0.8125rem] text-muted">
          {percent}% right of {spot.total}
        </p>
        {detailed ? (
          <>
            <div className="meter mt-2.5 max-w-sm" aria-hidden="true">
              <span style={{ width: `${percent}%` }} />
            </div>
            {spot.misses.length > 0 ? (
              <p className="mt-2 text-sm text-muted">
                Most often: {spot.misses.slice(0, 3).map((m) => missLabel(m.kind)).join("; ")}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      {href ? (
        <Link href={href} className="btn btn-secondary btn-sm">
          Practise
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      ) : null}
    </li>
  );
}
