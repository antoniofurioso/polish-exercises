"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ACCOUNT } from "@/components/AppShell";

/** Profile · Settings · Billing, as tabs at the top of each account page (the phone has no sidebar). */
export function AccountTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="mb-7 md:hidden">
      <ul className="seg w-full">
        {ACCOUNT.map(({ href, label }) => (
          <li key={href} className="flex-1">
            <Link
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={`flex min-h-10 items-center justify-center rounded-[0.5625rem] text-sm font-semibold ${
                pathname === href ? "bg-surface text-accent shadow-sm" : "text-muted"
              }`}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
