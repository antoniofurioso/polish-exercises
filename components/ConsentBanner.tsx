"use client";

import Link from "next/link";
import { POSTHOG_KEY, setConsent, shouldAsk, useConsent } from "@/lib/analytics";

/**
 * Asks once whether analytics may run (plans/phase-3.md §4). Shown only when this
 * build has a PostHog key and the learner has not chosen yet; the two answers
 * carry equal weight. The choice can be changed later on /privacy.
 */
export function ConsentBanner() {
  // undefined until hydrated, so the static HTML never carries the banner
  const consent = useConsent();
  if (!shouldAsk(!!POSTHOG_KEY, consent)) return null;

  return (
    <div
      role="region"
      aria-label="Analytics consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 px-5 py-4 shadow-lg backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">
          May we count how the app is used (sessions, right or wrong, never what you type)? It
          helps us improve it. Your progress stays on this device either way.{" "}
          <Link href="/privacy" className="text-accent underline underline-offset-4">
            Privacy
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <ConsentButton onClick={() => setConsent("granted")}>Allow analytics</ConsentButton>
          <ConsentButton onClick={() => setConsent("denied")}>No thanks</ConsentButton>
        </div>
      </div>
    </div>
  );
}

/** Both choices share this one style, so neither is nudged. */
export function ConsentButton({
  onClick,
  children,
  pressed,
}: {
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`flex-1 cursor-pointer rounded-xl border px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
        pressed ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent/50"
      }`}
    >
      {children}
    </button>
  );
}
