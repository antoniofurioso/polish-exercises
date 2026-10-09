import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import type { Example } from "@/lib/guides";
import { TOPIC_PAGES } from "@/lib/site";

/**
 * Building blocks of the reference pages (/polish-cases …). Server components:
 * everything on those pages is computed at build time by lib/guides.ts.
 */

/** Polish text, marked for screen readers, translation tools and search engines. */
export function Pl({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span lang="pl" className={className}>
      {children}
    </span>
  );
}

export function GuideLayout({
  path,
  eyebrow,
  title,
  intro,
  children,
}: {
  path: string;
  eyebrow: ReactNode;
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  const others = TOPIC_PAGES.filter((p) => p.path !== path);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-5 pb-12 pt-6 sm:pb-20">
        <header>
          <p className="text-sm uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1>
          <div className="mt-4 space-y-3 text-lg text-muted">{intro}</div>
        </header>
        <div className="mt-10 space-y-14">{children}</div>
        <nav aria-label="More grammar guides" className="mt-16 border-t border-line pt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">More grammar guides</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {others.map((p) => (
              <li key={p.path}>
                <Link
                  href={p.path}
                  className="block h-full rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-accent/50"
                >
                  <span className="block font-medium">{p.name}</span>
                  <span className="mt-1 block text-sm text-muted">{p.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </>
  );
}

export function Section({ id, title, children }: { id: string; title: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="scroll-mt-6 text-2xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A Polish sentence with its drilled form in bold, the English under it, and optionally the rule. */
export function ExampleLine({ example, showNote = false }: { example: Example; showNote?: boolean }) {
  return (
    <>
      <p lang="pl" className="sentence text-lg">
        {example.parts.map((part, i) =>
          part.key ? (
            <strong key={i} className="font-semibold text-accent">
              {part.text}
            </strong>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </p>
      <p className="text-sm text-muted">{example.en}</p>
      {showNote ? <p className="mt-1 text-sm">{example.note}</p> : null}
    </>
  );
}

export function ExampleList({ examples, showNote = true }: { examples: Example[]; showNote?: boolean }) {
  return (
    <ul className="space-y-3">
      {examples.map((example, i) => (
        <li key={i} className="rounded-xl border border-line bg-surface px-4 py-3">
          <ExampleLine example={example} showNote={showNote} />
        </li>
      ))}
    </ul>
  );
}

/** "Practise the genitive →": a configured /practice session. */
export function PractiseLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-xl bg-accent px-5 py-3 font-medium text-white transition-opacity hover:opacity-90"
    >
      {children} →
    </Link>
  );
}

/** A scrollable table: wide paradigms scroll inside their box, never the page. */
export function TableBox({ caption, children }: { caption?: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full border-collapse text-left text-sm">
        {caption ? <caption className="px-4 pt-3 text-left text-sm text-muted">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export const TH = "border-b border-line px-3 py-2 font-medium text-muted whitespace-nowrap";
export const TD = "border-b border-line px-3 py-2 align-top";
