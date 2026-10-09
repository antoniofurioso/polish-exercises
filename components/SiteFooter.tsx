import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { TOPIC_PAGES } from "@/lib/site";

const APP_LINKS = [
  { href: "/learn", label: "Learn" },
  { href: "/today", label: "Today" },
  { href: "/progress", label: "Progress" },
  { href: "/privacy", label: "Privacy" },
];

/** On every page (app/layout.tsx): the app, the grammar guides and the privacy policy. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-5 py-8 text-sm sm:grid-cols-[1fr_auto_auto] sm:gap-12">
        <div>
          <Link href="/" className="font-medium uppercase tracking-[0.2em] text-accent">
            {BRAND.name}
          </Link>
          <p className="mt-2 text-muted">{BRAND.tagline}</p>
        </div>
        <nav aria-label="App">
          <ul className="space-y-2">
            {APP_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-muted hover:text-accent">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Grammar guides">
          <ul className="space-y-2">
            {TOPIC_PAGES.map((page) => (
              <li key={page.path}>
                <Link href={page.path} className="text-muted hover:text-accent">
                  {page.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
