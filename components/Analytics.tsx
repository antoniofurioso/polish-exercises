"use client";

import { useEffect } from "react";
import { ConsentBanner } from "@/components/ConsentBanner";
import { POSTHOG_KEY, startAnalytics, track } from "@/lib/analytics";

/** Two install signals (ours and the browser's) usually arrive for one install. */
const INSTALL_DEDUPE_MS = 10_000;

/**
 * PostHog, after consent (plans/phase-3.md §4). Without NEXT_PUBLIC_POSTHOG_KEY
 * this renders nothing and loads nothing. With it: the consent banner, PostHog
 * started when consent was given on an earlier visit (page views on every
 * client-side navigation come from posthog-js itself), and `pwa_installed`.
 */
export function Analytics() {
  useEffect(() => {
    if (!POSTHOG_KEY) return;
    startAnalytics();
    let last = 0;
    const onInstalled = () => {
      const now = Date.now();
      if (now - last < INSTALL_DEDUPE_MS) return;
      last = now;
      track("pwa_installed", {});
    };
    window.addEventListener("pwa-installed", onInstalled);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("pwa-installed", onInstalled);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return POSTHOG_KEY ? <ConsentBanner /> : null;
}
