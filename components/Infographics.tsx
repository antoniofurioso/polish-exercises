import { CASE_INFO } from "@/lib/cases";
import type { CaseForm } from "@/lib/guides";

/**
 * The landing page's infographics. Server components: their data comes from the
 * lexicon and the scheduler at build time (caseForms, reviewIntervals in
 * lib/guides.ts), so they can never disagree with the app.
 */

/** One noun in every case, the ending in red. */
export function CaseForms({ forms }: { forms: CaseForm[] }) {
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {forms.map(({ kase, stem, ending }, i) => {
        const info = CASE_INFO[kase];
        return (
          <li key={kase} className="card flex min-h-52 flex-col gap-2 px-4 py-5">
            <span className="text-[0.8125rem] font-semibold text-accent">{String(i + 1).padStart(2, "0")}</span>
            <span className="font-semibold">
              {info.en}
              <span lang="pl" className="block text-[0.8125rem] font-normal text-muted">
                {info.pl}
              </span>
            </span>
            <span lang="pl" className="text-[0.8125rem] text-muted">
              {info.question}
            </span>
            <span lang="pl" className="sentence mt-auto text-[2rem] leading-tight">
              {stem}
              <span className="text-accent">{ending}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Recall falling between reviews and reset by each right answer, with the real intervals. */
export function ReviewCurve({ intervals }: { intervals: number[] }) {
  // x positions on a compressed time axis, each later gap drawn wider; a tail runs on after the last review
  const xs = [40];
  const step = 800 / intervals.reduce((sum, _d, i) => sum + 1 + i * 0.6, 0);
  intervals.forEach((_d, i) => xs.push(xs[i] + step * (1 + i * 0.6)));
  const ends = [...xs.slice(1), 990];
  const top = 40;
  const base = 220;
  let path = `M${xs[0]} ${top}`;
  ends.forEach((to, i) => {
    const from = i === 0 ? xs[0] : ends[i - 1];
    // each forgetting curve is flatter than the one before
    const drop = 140 * Math.pow(0.72, i);
    path += ` Q${from + (to - from) * 0.35} ${top + drop * 0.9} ${to} ${top + drop}`;
    if (i < ends.length - 1) path += ` L${to} ${top}`;
  });
  const reviews = xs.slice(1);
  const label = (d: number) => `+${d} ${d === 1 ? "day" : "days"}`;
  return (
    <svg
      viewBox="0 0 1000 280"
      role="img"
      aria-label={`Each right answer resets your memory of a form, and the next review comes later: ${intervals.map(label).join(", ")}.`}
      className="mt-7 block h-auto w-full"
    >
      <line x1="40" y1={base} x2="990" y2={base} className="stroke-line-strong" />
      <line x1="40" y1={top} x2="990" y2={top} strokeDasharray="4 6" className="stroke-line" />
      <path d={path} fill="none" strokeWidth="3" strokeLinejoin="round" className="stroke-accent" />
      {reviews.map((x) => (
        <circle key={x} cx={x} cy={top} r="7" strokeWidth="3" className="fill-surface stroke-accent" />
      ))}
      <g fontSize="14" fontWeight="600" textAnchor="middle" className="fill-foreground">
        {reviews.map((x, i) => (
          <text key={x} x={x} y={base + 30}>
            {label(intervals[i])}
          </text>
        ))}
      </g>
      <g fontSize="13" className="fill-muted">
        <text x="40" y={base + 30}>
          First answer
        </text>
        <text x="40" y={top - 12}>
          Remembered
        </text>
      </g>
    </svg>
  );
}

const MIX = [
  {
    share: 6,
    swatch: "bg-accent-fill",
    title: "Reviews that are due",
    body: "First, and never more than 70% of the session while new words are waiting.",
  },
  {
    share: 3,
    swatch: "bg-accent opacity-55",
    title: "A few new cards",
    body: "Introduced by level, with the drills taking turns.",
  },
  {
    share: 2,
    swatch: "bg-accent-line",
    title: "Your weakest spots",
    body: "Then the skills you miss most, until you reach your daily goal.",
  },
];

/** What today's practice is made of (lib/today.ts buildToday), as a stacked bar. */
export function SessionMix() {
  return (
    <>
      <div aria-hidden="true" className="mt-7 flex h-[1.125rem] gap-[3px] overflow-hidden rounded-full">
        {MIX.map((m) => (
          <span key={m.title} className={m.swatch} style={{ flex: m.share }} />
        ))}
      </div>
      <ul className="mt-6 grid gap-6 sm:grid-cols-3">
        {MIX.map((m) => (
          <li key={m.title} className="flex gap-3.5">
            <span aria-hidden="true" className={`mt-1.5 h-3 w-3 shrink-0 rounded ${m.swatch}`} />
            <span>
              <span className="block font-semibold">{m.title}</span>
              <span className="mt-1 block text-sm text-muted">{m.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
