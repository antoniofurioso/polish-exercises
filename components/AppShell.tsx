"use client";

import { ChartColumn, CreditCard, House, Play, SlidersHorizontal, User, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { MergedNotice, planName } from "@/components/account";
import { DrillIcon } from "@/components/DrillIcon";
import { Logo } from "@/components/Logo";
import { apiEnabled, useAccount } from "@/lib/account";
import { DRILLS } from "@/lib/drills";
import { signInHref } from "@/lib/site";
import { useProfile } from "@/lib/storage";
import { EXERCISE_KINDS } from "@/lib/types";

type NavItem = { href: string; label: string; icon: LucideIcon };

const PRACTICE: NavItem[] = [
  { href: "/learn", label: "Home", icon: House },
  { href: "/today", label: "Today’s practice", icon: Play },
  { href: "/progress", label: "Progress", icon: ChartColumn },
];

export const ACCOUNT: NavItem[] = [
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal },
  { href: "/billing", label: "Billing", icon: CreditCard },
];

/** The phone's bottom tabs: the four places a learner goes daily. */
const TABS: (NavItem & { match: string[] })[] = [
  { href: "/learn", label: "Home", icon: House, match: ["/learn", ...EXERCISE_KINDS.map((k) => DRILLS[k].route)] },
  { href: "/today", label: "Practise", icon: Play, match: ["/today"] },
  { href: "/progress", label: "Progress", icon: ChartColumn, match: ["/progress"] },
  { href: "/profile", label: "Account", icon: User, match: ACCOUNT.map((a) => a.href) },
];

const isAt = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/**
 * The signed-in app's frame (app/(app)/layout.tsx): a sidebar from tablet width
 * up, and on a phone a top bar plus bottom tabs. /today and /practice are not
 * inside it: a session runs full screen.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const profile = useProfile();
  const initial = profile.name.trim().charAt(0).toUpperCase();
  const account = useAccount();
  /** With accounts in the build, a signed-out learner's sidebar card is the way to sign in. */
  const signIn = apiEnabled() && !account;
  const planLine = !apiEnabled() ? "Free · beta" : account ? planName(account.entitlement) : "Sign in";

  const navLink = ({ href, label, icon: Icon }: NavItem, current: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={current ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-[0.625rem] px-3 font-medium transition-colors ${
        current ? "bg-accent-soft font-semibold text-accent-strong" : "text-foreground-soft hover:bg-subtle hover:text-foreground"
      }`}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      {label}
    </Link>
  );

  const avatar = (size: string) => (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-full bg-accent-fill font-semibold text-on-accent`}
      aria-hidden="true"
    >
      {initial || <User size={18} />}
    </span>
  );

  return (
    <div className="flex min-h-screen flex-1 bg-subtle">
      <aside
        aria-label="App"
        className="sticky top-0 hidden h-screen w-[16.5rem] self-start shrink-0 flex-col gap-7 overflow-y-auto border-r border-line bg-surface px-[1.125rem] py-7 md:flex"
      >
        <div className="px-3">
          <Logo href="/learn" size={26} />
        </div>
        <nav aria-label="Practice" className="flex flex-col gap-0.5">
          <p className="label-caps px-3 pb-2 text-[0.6875rem]">Practice</p>
          {PRACTICE.map((item) => navLink(item, isAt(pathname, item.href)))}
        </nav>
        <nav aria-label="Drills" className="flex flex-col gap-0.5">
          <p className="label-caps px-3 pb-2 text-[0.6875rem]">Drills</p>
          {EXERCISE_KINDS.map((kind) => {
            const drill = DRILLS[kind];
            const current = isAt(pathname, drill.route);
            return (
              <Link
                key={kind}
                href={drill.route}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-10 items-center gap-3 rounded-[0.625rem] px-3 text-[0.9375rem] transition-colors ${
                  current ? "bg-accent-soft font-semibold text-accent-strong" : "text-foreground-soft hover:bg-subtle hover:text-foreground"
                }`}
              >
                <DrillIcon kind={kind} size={18} />
                {drill.title}
              </Link>
            );
          })}
        </nav>
        <nav aria-label="Account" className="flex flex-col gap-0.5">
          <p className="label-caps px-3 pb-2 text-[0.6875rem]">Account</p>
          {ACCOUNT.map((item) => navLink(item, isAt(pathname, item.href)))}
        </nav>
        <Link
          href={signIn ? signInHref("/learn") : "/profile"}
          className="mt-auto flex items-center gap-3 rounded-2xl border border-line p-3 text-foreground hover:border-accent-line"
        >
          {avatar("h-[2.375rem] w-[2.375rem]")}
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold">{profile.name || "Your profile"}</span>
            <span className={`text-xs ${signIn ? "font-semibold text-accent" : "text-muted"}`}>{planLine}</span>
          </span>
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur md:hidden">
          <Logo href="/learn" size={26} />
          <Link href="/profile" aria-label="Your profile">
            {avatar("h-10 w-10")}
          </Link>
        </header>

        <div className="flex-1 pb-24 md:pb-0">
          <MergedNotice />
          {children}
        </div>

        <nav
          aria-label="App"
          className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur md:hidden"
        >
          {TABS.map(({ href, label, icon: Icon, match }) => {
            const current = match.some((m) => isAt(pathname, m));
            return (
              <Link
                key={href}
                href={href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[0.6875rem] ${
                  current ? "font-semibold text-accent" : "font-medium text-muted"
                }`}
              >
                <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/** The frame of an app page: width, padding and the title row. */
export function AppPage({
  title,
  intro,
  action,
  children,
  width = "max-w-5xl",
}: {
  title: ReactNode;
  intro?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  return (
    <main className={`mx-auto w-full ${width} px-4 py-7 sm:px-8 sm:py-10 lg:px-14`}>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{title}</h1>
          {intro ? <div className="mt-1.5 text-muted">{intro}</div> : null}
        </div>
        {action}
      </header>
      {children}
    </main>
  );
}
