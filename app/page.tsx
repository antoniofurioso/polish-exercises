import Link from "next/link";

const EXERCISES: { href: string; title: string; pl: string; blurb: string }[] = [
  {
    href: "/cases",
    title: "Cases",
    pl: "Przypadki",
    blurb:
      "Decline nouns and adjectives across all seven cases, one sentence at a time.",
  },
  {
    href: "/pronouns",
    title: "Demonstrative pronouns",
    pl: "Zaimki wskazujące",
    blurb:
      "Make ten / tamten agree with the noun in gender, number and case.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-16">
      <header className="mb-10">
        <p className="text-sm uppercase tracking-[0.2em] text-accent">Ćwiczenia</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Polish practice</h1>
        <p className="mt-3 text-muted">Pick an exercise to set up.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {EXERCISES.map((ex) => (
          <Link
            key={ex.href}
            href={ex.href}
            className="rounded-xl border border-line bg-surface px-5 py-5 transition-colors hover:border-accent/50"
          >
            <span className="block text-xs uppercase tracking-[0.2em] text-accent">{ex.pl}</span>
            <span className="mt-1 block text-lg font-medium">{ex.title}</span>
            <span className="mt-2 block text-sm text-muted">{ex.blurb}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
