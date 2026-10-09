"use client";

import { useState } from "react";
import { ConsentButton } from "@/components/ConsentBanner";
import { POSTHOG_KEY, setConsent, useConsent } from "@/lib/analytics";

/** Prefix of every key this site keeps in localStorage (lib/storage.ts, lib/analytics.ts). */
const LOCAL_PREFIX = "polish.";

/** The analytics choice, changeable at any time (plans/phase-3.md §5). */
export function ConsentChoice() {
  const consent = useConsent();

  if (!POSTHOG_KEY) {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
        Analytics are switched off on this version of the site: nothing is sent.
      </p>
    );
  }
  if (consent === undefined) return null;

  const status =
    consent === "granted"
      ? "Analytics are on. Thank you!"
      : consent === "denied"
        ? "Analytics are off. Nothing is sent."
        : "You have not chosen yet, so analytics are off.";

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface px-4 py-4">
      <p className="text-sm font-medium" role="status">
        {status}
      </p>
      <div className="mt-3 flex gap-2">
        <ConsentButton pressed={consent === "granted"} onClick={() => setConsent("granted")}>
          Allow analytics
        </ConsentButton>
        <ConsentButton pressed={consent === "denied"} onClick={() => setConsent("denied")}>
          No thanks
        </ConsentButton>
      </div>
    </div>
  );
}

/** Deletes everything this site stored on the device, after a confirmation. */
export function ClearLocalData() {
  const [failed, setFailed] = useState(false);

  const clear = () => {
    if (!window.confirm("Delete your progress, streak and settings from this device? This cannot be undone.")) return;
    try {
      // withdraw analytics first, so PostHog's own storage goes too
      if (POSTHOG_KEY) setConsent("denied");
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key?.startsWith(LOCAL_PREFIX)) keys.push(key);
      }
      keys.forEach((key) => window.localStorage.removeItem(key));
      window.location.reload();
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={clear}
        className="cursor-pointer rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium hover:border-accent/50"
      >
        Delete my data from this device
      </button>
      {failed ? (
        <p className="mt-2 text-sm text-warn">
          This browser would not let the site clear its storage. You can clear it in your browser’s
          settings for this site.
        </p>
      ) : null}
    </div>
  );
}
