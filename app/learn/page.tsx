import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { TodayButton } from "@/components/TodayButton";
import { DRILLS } from "@/lib/drills";
import { pageMetadata } from "@/lib/site";
import { EXERCISE_KINDS } from "@/lib/types";

export const metadata = pageMetadata({
  title: "Polish grammar drills",
  description:
    "Pick a Polish grammar drill: the seven cases, demonstrative and possessive pronouns, numbers and dates, verb tenses, or everything shuffled together.",
  path: "/learn",
});

/** The app's home: today's practice, then every drill's configurator. */
export default function LearnPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-5 pb-10 pt-4 sm:pb-16">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold sm:text-4xl">Polish practice</h1>
          <p className="mt-3 text-muted">Start today’s practice, or pick an exercise to set up.</p>
        </header>

        <TodayButton />

        <div className="grid gap-3 sm:grid-cols-2">
          {EXERCISE_KINDS.map((kind) => DRILLS[kind]).map((drill) => (
            <Link
              key={drill.route}
              href={drill.route}
              className="rounded-xl border border-line bg-surface px-5 py-5 transition-colors hover:border-accent/50"
            >
              <span lang="pl" className="block text-xs uppercase tracking-[0.2em] text-accent">
                {drill.pl}
              </span>
              <span className="mt-1 block text-lg font-medium">{drill.title}</span>
              <span className="mt-2 block text-sm text-muted">{drill.blurb}</span>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
