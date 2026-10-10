import { ArrowRight, BookOpen, Check, Flame, Lightbulb, Repeat, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import { DrillIcon } from "@/components/DrillIcon";
import { CaseForms, ReviewCurve, SessionMix } from "@/components/Infographics";
import { SampleQuestion } from "@/components/SampleQuestion";
import { StartButton } from "@/components/StartButton";
import { BRAND } from "@/lib/brand";
import { DRILLS } from "@/lib/drills";
import { caseForms, reviewIntervals, sampleQuestions } from "@/lib/guides";
import { TOPIC_PAGES, pageMetadata } from "@/lib/site";
import { EXERCISE_KINDS } from "@/lib/types";

const HEADLINE = "Practise Polish grammar: cases, verbs and numbers";

export const metadata = pageMetadata({
  title: `${HEADLINE} · ${BRAND.name}`,
  description: BRAND.description,
  path: "/",
  absolute: true,
});

/** Which reference page explains each drill; shuffle has none, possessives share the pronouns page. */
const GUIDE_FOR: Record<string, string> = {
  cases: "/polish-cases",
  pronouns: "/polish-pronouns",
  possessives: "/polish-pronouns",
  numbers: "/polish-numbers",
  verbs: "/polish-verbs",
};

/** One icon per grammar guide, matching the drill it explains. */
const GUIDE_ICON: Record<string, "cases" | "pronouns" | "numbers" | "verbs"> = {
  "/polish-cases": "cases",
  "/polish-pronouns": "pronouns",
  "/polish-numbers": "numbers",
  "/polish-verbs": "verbs",
};

const STEPS = [
  {
    icon: BookOpen,
    title: "One sentence at a time",
    body: "Each question is a real Polish sentence with its English meaning. Fill in the missing form by typing it or picking it, and the rule behind it appears straight after.",
  },
  {
    icon: Target,
    title: "A daily goal you choose",
    body: "Today’s practice puts the session together for you. Set a goal of 10, 20 or 40 questions a day and keep a streak going.",
  },
  {
    icon: Repeat,
    title: "Spaced repetition",
    body: "Every form you practise is scheduled on its own. Right answers come back further apart each time; wrong ones come back within minutes.",
  },
];

const PERKS = ["Free during the beta", "No sign-up", "Works offline"];

/** The landing page: what the app is, a live question, the drills, how it works, and the way in. */
export default function LandingPage() {
  const samples = sampleQuestions();
  const forms = caseForms("kot");
  const intervals = reviewIntervals(4);

  return (
    <main>
      {/* hero */}
      <section className="pb-20 pt-12 sm:pb-28 sm:pt-20">
        <div className="container-page grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-18">
          <div>
            <span className="chip chip-accent">
              <Sparkles size={15} aria-hidden="true" />
              {BRAND.tagline}
            </span>
            <h1 className="display mt-7">
              Practise Polish grammar, one sentence <span className="text-accent">at a time.</span>
            </h1>
            <p className="lead mt-7 max-w-xl">
              {BRAND.name} drills the parts of Polish that textbooks explain once and learners get wrong for years:
              the seven cases, pronoun agreement, the noun after a number, and verb aspect and tense. Ten minutes a
              day, with the rule after every answer.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <StartButton />
              <Link href="/learn" className="btn btn-secondary btn-lg">
                Browse the drills
              </Link>
            </div>
            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              {PERKS.map((perk) => (
                <li key={perk} className="flex items-center gap-2">
                  <Check size={18} className="text-accent" aria-hidden="true" />
                  {perk}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative p-3 sm:p-7">
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-[2rem] border border-accent-line bg-[linear-gradient(180deg,var(--background)_50%,var(--accent-soft)_50%)]"
            />
            <SampleQuestion exercises={samples} />
            <span className="chip absolute -right-2 -top-2 hidden bg-surface shadow-chip sm:inline-flex">
              <Flame size={18} className="text-accent" aria-hidden="true" />
              Daily streak
            </span>
            <span className="chip absolute -bottom-3 -left-3 hidden bg-surface shadow-chip sm:inline-flex">
              <Lightbulb size={18} className="text-accent" aria-hidden="true" />
              The rule after every answer
            </span>
          </div>
        </div>
      </section>

      {/* drills */}
      <section id="drills" aria-labelledby="drills-title" className="section section-alt scroll-mt-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="eyebrow">What you can practise</p>
            <h2 id="drills-title" className="heading mt-3.5">
              Six drills for the grammar that trips everyone up
            </h2>
            <p className="lead mt-4">Every question is a real Polish sentence with its English meaning.</p>
          </div>
          <ul className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {EXERCISE_KINDS.map((kind) => {
              const drill = DRILLS[kind];
              return (
                <li key={kind} className="card flex flex-col gap-4 p-7">
                  <span className="tile">
                    <DrillIcon kind={kind} size={24} />
                  </span>
                  <div>
                    <span lang="pl" className="eyebrow block text-xs">
                      {drill.pl}
                    </span>
                    <h3 className="mt-1.5 text-xl font-semibold">
                      <Link href={drill.route} className="hover:text-accent">
                        {drill.title}
                      </Link>
                    </h3>
                  </div>
                  <p className="text-[0.9375rem] text-muted">{drill.blurb}</p>
                  {GUIDE_FOR[kind] ? (
                    <Link href={GUIDE_FOR[kind]} className="link mt-auto text-sm">
                      Read the grammar →
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* infographic: one noun in every case */}
      <section aria-labelledby="cases-title" className="section">
        <div className="container-page">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div className="max-w-2xl">
              <p className="eyebrow">At a glance</p>
              <h2 id="cases-title" className="heading mt-3.5">
                One noun, seven cases
              </h2>
              <p className="lead mt-4">
                Polish shows a word’s job with its ending. Here is{" "}
                <span lang="pl" className="sentence text-xl text-foreground">
                  {forms[0].stem}
                </span>{" "}
                (cat) in every case.
              </p>
            </div>
            <Link href="/polish-cases" className="link inline-flex items-center gap-2">
              Read the cases guide <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-14">
            <CaseForms forms={forms} />
          </div>
        </div>
      </section>

      {/* how it works, with the review curve and the session mix */}
      <section id="how" aria-labelledby="how-title" className="section section-alt scroll-mt-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title" className="heading mt-3.5">
              A short session every day, and nothing is forgotten
            </h2>
          </div>
          <ol className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="card p-7">
                <div className="flex items-center justify-between">
                  <span className="tile">
                    <step.icon size={24} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span aria-hidden="true" className="text-[2.75rem] font-bold tracking-tighter text-accent-line">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2.5 text-[0.9375rem] text-muted">{step.body}</p>
              </li>
            ))}
          </ol>

          <figure className="card mt-5 p-6 sm:p-9">
            <figcaption className="flex flex-wrap items-baseline justify-between gap-4">
              <span className="text-xl font-semibold">When a form comes back</span>
              <span className="flex flex-wrap gap-5 text-[0.8125rem] text-muted">
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-[3px] w-[18px] rounded bg-accent" />
                  How well you remember it
                </span>
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border-[3px] border-accent bg-surface" />
                  A review, answered right
                </span>
              </span>
            </figcaption>
            <ReviewCurve intervals={intervals} />
            <p className="mt-4 text-sm text-muted">
              Get one wrong and it is back in 10 minutes, then once more at the end of the session.
            </p>
          </figure>

          <figure className="card mt-5 p-6 sm:p-9">
            <figcaption className="text-xl font-semibold">What goes into today’s practice</figcaption>
            <SessionMix />
          </figure>
        </div>
      </section>

      {/* guides */}
      <section id="guides" aria-labelledby="guides-title" className="section scroll-mt-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="eyebrow">Grammar guides</p>
            <h2 id="guides-title" className="heading mt-3.5">
              The rules, in plain English
            </h2>
            <p className="lead mt-4">Short reference pages with every ending table and an example for each rule.</p>
          </div>
          <ul className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {TOPIC_PAGES.map((page) => (
              <li key={page.path}>
                <Link href={page.path} className="card card-link flex h-full flex-col gap-3 p-6">
                  <span className="text-accent">
                    <DrillIcon kind={GUIDE_ICON[page.path] ?? "cases"} size={26} />
                  </span>
                  <span className="mt-2 text-[1.0625rem] font-semibold">{page.name}</span>
                  <span className="text-sm text-muted">{page.blurb}</span>
                  <span className="mt-auto pt-2 text-sm font-semibold text-accent">Read guide →</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" aria-labelledby="pricing-title" className="section section-alt scroll-mt-20">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Pricing</p>
            <h2 id="pricing-title" className="heading mt-3.5">
              Free while we’re in beta
            </h2>
            <p className="lead mt-4">Every drill and every level is free today. Paid plans come later, with accounts.</p>
          </div>
          <div className="mx-auto mt-14 grid grid-cols-1 max-w-3xl gap-5 sm:grid-cols-2">
            <div className="card flex flex-col p-8">
              <p className="font-semibold">Beta</p>
              <p className="mt-3 text-[2.75rem] font-bold tracking-tight">€0</p>
              <ul className="mt-6 flex flex-col gap-3 text-[0.9375rem]">
                {["All six drills and the grammar guides", "Today’s practice with spaced repetition", "Progress saved on this device"].map(
                  (f) => (
                    <li key={f} className="flex gap-2.5">
                      <Check size={20} className="shrink-0 text-accent" aria-hidden="true" />
                      {f}
                    </li>
                  ),
                )}
              </ul>
              <Link href="/today" className="btn btn-primary btn-block mt-8">
                Start free
              </Link>
            </div>
            <div className="card relative flex flex-col border-2 border-accent p-8">
              <span className="absolute -top-3.5 left-8 rounded-full bg-accent-fill px-3 py-1 text-xs font-semibold text-on-accent">
                Coming later
              </span>
              <p className="font-semibold">Pro</p>
              <p className="mt-3 text-[2.75rem] font-bold tracking-tight text-muted">Soon</p>
              <ul className="mt-6 flex flex-col gap-3 text-[0.9375rem]">
                {["Everything in the beta", "An account, with your progress on every device"].map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check size={20} className="shrink-0 text-accent" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/billing" className="btn btn-secondary btn-block mt-auto">
                See plans
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* call to action */}
      <section className="bg-subtle pb-20 sm:pb-28">
        <div className="container-page">
          <div className="panel-accent flex flex-wrap items-center justify-between gap-8 p-9 sm:p-16">
            <svg
              aria-hidden="true"
              viewBox="0 0 200 200"
              className="pointer-events-none absolute -right-16 -top-16 h-80 w-80 opacity-15"
            >
              <circle cx="100" cy="100" r="90" fill="none" stroke="#fff" strokeWidth="2" />
              <circle cx="100" cy="100" r="60" fill="none" stroke="#fff" strokeWidth="2" />
              <circle cx="100" cy="100" r="30" fill="none" stroke="#fff" strokeWidth="2" />
            </svg>
            <div className="relative max-w-xl">
              <h2 className="heading">Ten minutes a day is enough.</h2>
              <p className="mt-3.5 text-lg text-on-accent-soft">Start with today’s practice: it picks the questions for you.</p>
            </div>
            <StartButton inverse className="relative" />
          </div>
        </div>
      </section>
    </main>
  );
}
