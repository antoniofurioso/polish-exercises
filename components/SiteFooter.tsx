import Link from "next/link";
import { FlagMark } from "@/components/Logo";
import { BRAND } from "@/lib/brand";
import { TOPIC_PAGES } from "@/lib/site";

const COLUMNS = [
  {
    title: "Practise",
    links: [
      { href: "/today", label: "Today’s practice" },
      { href: "/learn", label: "All drills" },
      { href: "/progress", label: "Progress" },
    ],
  },
  { title: "Guides", links: TOPIC_PAGES.map((p) => ({ href: p.path, label: p.name })) },
  {
    title: "About",
    links: [
      { href: "/#pricing", label: "Pricing" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

/** The footer of the marketing pages (app/(site)/layout.tsx): the app, the grammar guides and the privacy policy. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5 font-bold text-foreground">
            <FlagMark size={24} />
            {BRAND.name}
          </Link>
          <p className="mt-3 max-w-60 text-sm text-muted">{BRAND.tagline}, one sentence at a time.</p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <p className="text-sm font-semibold">{column.title}</p>
            <ul className="mt-3 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted hover:text-accent">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="container-page pb-10 text-[0.8125rem] text-muted">© {new Date().getFullYear()} {BRAND.name}</div>
    </footer>
  );
}
