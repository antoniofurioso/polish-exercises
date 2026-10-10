"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { apiEnabled, fetchMe, hasAccess, useAccount } from "@/lib/account";
import { track, type Source } from "@/lib/analytics";
import { plansHref, signInHref } from "@/lib/site";
import { useHydrated } from "@/lib/storage";

/**
 * The paywall in front of a session (plans/phase-4.md §13.1), placed before the
 * session is built. Without an API in the build it is a pass-through. Otherwise:
 * nothing until hydrated; signed out → /signin; signed in without access (the
 * cached entitlement) → one `GET /me` to be sure, then /plans. Client-only, so
 * bypassable, and that is accepted. Access is judged at mount, so a session
 * that started never closes under the learner.
 */
export function AccessGate({ from, children }: { from: Source; children: ReactNode }) {
  if (!apiEnabled()) return <>{children}</>;
  return <Gate from={from}>{children}</Gate>;
}

function Gate({ from, children }: { from: Source; children: ReactNode }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const account = useAccount();
  const [mountedAt] = useState(() => Date.now());
  /** The one `GET /me` after a "no access" answer from the cache has come back (or failed). */
  const [rechecked, setRechecked] = useState(false);

  const signedIn = hydrated && account !== null;
  const allowed = signedIn && hasAccess(account.entitlement, mountedAt);

  useEffect(() => {
    if (!hydrated || allowed) return;
    const here = `${window.location.pathname}${window.location.search}`;
    if (!signedIn) {
      router.replace(signInHref(here));
      return;
    }
    if (!rechecked) {
      let alive = true;
      void fetchMe()
        .catch(() => {})
        .finally(() => {
          if (alive) setRechecked(true);
        });
      return () => {
        alive = false;
      };
    }
    track("paywall_shown", { from });
    router.replace(plansHref(here));
  }, [hydrated, signedIn, allowed, rechecked, from, router]);

  if (allowed) return <>{children}</>;
  if (!hydrated) return null;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-24 sm:px-6">
      <p role="status" className="text-muted">
        {signedIn ? "Checking your plan…" : "Taking you to sign in…"}
      </p>
    </main>
  );
}
