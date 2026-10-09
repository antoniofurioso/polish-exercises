import Link from "next/link";
import { SampleQuestion } from "@/components/SampleQuestion";
import { SiteHeader } from "@/components/SiteHeader";
import { StartButton } from "@/components/StartButton";
import { BRAND } from "@/lib/brand";
import { DRILLS } from "@/lib/drills";
import { sampleQuestions } from "@/lib/guides";
import { TOPIC_PAGES, pageMetadata } from "@/lib/site";
import { EXERCISE_KINDS } from "@/lib/types";

const HEADLINE = "Practise Polish grammar: cases, verbs and numbers";

export const metadata = pageMetadata({
  title: `${HEADLINE} · ${BRAND.name}`,
  description: BRAND.description,
  path: "/",
  absolute: true,
});

/** Which reference page explains each drill; shuffle and possessives share one. */
const GUIDE_FOR: Record<string, string> = {
  cases: "/polish-cases",
  pronouns: "/polish-pronouns",
  possessives: "/polish-pronouns",
  numbers: "/polish-numbers",
  verbs: "/polish-verbs",
};

const STEPS = [
  {
    title: "One sentence at a time",
    body: "Each question is a real Polish sentence with its English meaning. Fill in the missing form by typing it or picking it, and the rule behind it appears straight after.",
  },
  {
    title: "A short session every day",
    body: "Today’s practice puts the session together for you: the reviews that are due first, then a few new words, then your weakest spots. Set a daily goal of 10, 20 or 40 questions and keep a streak going.",
  },
  {
    title: "Spaced repetition",
    body: "Every form you practise is scheduled on its own. Get it right and it comes back after a day, then three, then further apart each time; get it wrong and it comes back within minutes, and again at the end of the session.",
  },
];

/** The landing page: what the app is, a live question, the drills, how it works, and the way in. */
export default function LandingPage() {
  const samples = sampleQuestions();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-5 pb-12 pt-6 sm:pb-20 sm:pt-10">
        <section>
          <p className="text-sm uppercase tracking-[0.2em] text-accent">{BRAND.tagline}</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">{HEADLINE}</h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">
            {BRAND.name} drills the parts of Polish that textbooks explain once and learners get wrong for
            years: the seven cases, pronoun agreement, the noun after a number, and verb aspect and tense.
            Short daily sessions, with the rule after every answer.
          </p>
          <div className="mt-8 flex flex-wrap items-start gap-x-6 gap-y-3">
            <StartButton />
            <Link href="/learn" className="py-4 text-accent underline underline-offset-4">
              Or choose a drill
            </Link>
          </div>
        </section>

        <section className="mt-14" aria-labelledby="sample">
          <h2 id="sample" className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
            See how it works
          </h2>
          <SampleQuestion exercises={samples} />
        </section>

        <section className="mt-14" aria-labelledby="drills">
          <h2 id="drills" className="text-2xl font-semibold">
            What you can practise
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {EXERCISE_KINDS.map((kind) => ({ kind, drill: DRILLS[kind] })).map(({ kind, drill }) => (
              <div key={kind} className="rounded-xl border border-line bg-surface px-5 py-5">
                <span lang="pl" className="block text-xs uppercase tracking-[0.2em] text-accent">
                  {drill.pl}
                </span>
                <Link href={drill.route} className="mt-1 block text-lg font-medium hover:text-accent">
                  {drill.title}
                </Link>
                <span className="mt-2 block text-sm text-muted">{drill.blurb}</span>
                {GUIDE_FOR[kind] ? (
                  <Link href={GUIDE_FOR[kind]} className="mt-3 inline-block text-sm text-accent underline underline-offset-4">
                    Read the grammar
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14" aria-labelledby="how">
          <h2 id="how" className="text-2xl font-semibold">
            How daily practice works
          </h2>
          <ol className="mt-5 grid gap-3 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="rounded-xl border border-line bg-surface p-5">
                <span className="text-sm font-semibold text-accent">{i + 1}</span>
                <h3 className="mt-1 font-medium">{step.title}</h3>
                <p className="mt-2 text-sm text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-sm text-muted">
            No account and nothing to sign up for: your progress is saved in this browser, on this device.
          </p>
        </section>

        <section className="mt-14" aria-labelledby="guides">
          <h2 id="guides" className="text-2xl font-semibold">
            Polish grammar guides
          </h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {TOPIC_PAGES.map((page) => (
              <li key={page.path}>
                <Link
                  href={page.path}
                  className="block h-full rounded-xl border border-line bg-surface px-5 py-4 transition-colors hover:border-accent/50"
                >
                  <span className="block font-medium">{page.name}</span>
                  <span className="mt-1 block text-sm text-muted">{page.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* muted grey is too faint on the pink panel (WCAG AA): darken it here */}
        <section className="mt-14 rounded-2xl bg-accent-soft p-6 sm:p-8 [&_.text-muted]:text-foreground/80">
          <h2 className="text-2xl font-semibold">Ten minutes a day is enough</h2>
          <p className="mt-2 text-muted">Start with today’s practice: it picks the questions for you.</p>
          <StartButton className="mt-5" />
        </section>
      </main>
    </>
  );
}
