import Link from "next/link";
import type { ReactNode } from "react";
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
    <main className="container-page max-w-4xl pb-20 pt-10 sm:pb-28 sm:pt-16">
      <header>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="heading mt-3">{title}</h1>
        <div className="lead mt-5 space-y-3">{intro}</div>
      </header>
      <div className="mt-14 space-y-16">{children}</div>
      <nav aria-label="More grammar guides" className="mt-20 border-t border-line pt-10">
        <h2 className="label-caps">More grammar guides</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {others.map((p) => (
            <li key={p.path}>
              <Link href={p.path} className="card card-link h-full px-5 py-4">
                <span className="block font-semibold">{p.name}</span>
                <span className="mt-1 block text-sm text-muted">{p.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}

export function Section({ id, title, children }: { id: string; title: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="scroll-mt-24 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
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
            <strong key={i} className="font-semibold text-accent-strong">
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
        <li key={i} className="card px-5 py-4">
          <ExampleLine example={example} showNote={showNote} />
        </li>
      ))}
    </ul>
  );
}

/** "Practise the genitive →": a configured /practice session. */
export function PractiseLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="btn btn-primary">
      {children} →
    </Link>
  );
}

/** A scrollable table: wide paradigms scroll inside their box, never the page. */
export function TableBox({ caption, children }: { caption?: ReactNode; children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        {caption ? <caption className="px-4 pt-4 text-left text-sm text-muted">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export const TH = "border-b border-line px-4 py-3 font-semibold text-muted whitespace-nowrap";
export const TD = "border-b border-line px-4 py-3 align-top";
