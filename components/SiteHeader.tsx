"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Logo";

const LINKS = [
  { href: "/learn", label: "Drills" },
  { href: "/#how", label: "How it works" },
  { href: "/#guides", label: "Guides" },
  { href: "/progress", label: "Progress" },
];

/** The top bar of the landing page, the grammar guides and the privacy policy (app/(site)/layout.tsx). */
export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  // the menu closes itself on navigation: it is open only for the page it was opened on
  const isOpen = open === pathname;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4 sm:h-[4.75rem]">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-2 sm:gap-8">
          <ul className="hidden items-center gap-8 md:flex">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-[0.9375rem] font-medium text-foreground-soft hover:text-accent">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/today" className="btn btn-primary btn-sm sm:min-h-11 sm:px-[1.125rem] sm:text-[0.9375rem]">
            Start practising
          </Link>
          <button
            type="button"
            className="icon-btn md:hidden"
            aria-expanded={isOpen}
            aria-controls="site-menu"
            aria-label={isOpen ? "Close menu" : "Open menu"}
            onClick={() => setOpen(isOpen ? null : pathname)}
          >
            {isOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </nav>
      </div>
      {isOpen ? (
        <ul id="site-menu" className="container-page flex flex-col border-t border-line pb-4 pt-2 md:hidden">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => setOpen(null)}
                className="flex min-h-12 items-center border-b border-line font-medium text-foreground"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}
