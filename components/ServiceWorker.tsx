"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker, public/sw.js (plans/phase-3.md §2), in
 * production builds only: `next dev` never registers it. The TTS Worker's URL
 * goes along as `?tts=`, so the worker knows which cross-origin audio to cache.
 *
 * Also re-dispatches the browser's `appinstalled` as a window CustomEvent
 * "pwa-installed", for analytics to pick up without knowing about the PWA.
 */
export function ServiceWorker() {
  useEffect(() => {
    const onInstalled = () => window.dispatchEvent(new CustomEvent("pwa-installed"));
    window.addEventListener("appinstalled", onInstalled);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      const tts = process.env.NEXT_PUBLIC_TTS_URL;
      const script = tts ? `/sw.js?tts=${encodeURIComponent(tts.replace(/\/+$/, ""))}` : "/sw.js";
      // a new version installs in the background and takes over on the next visit
      navigator.serviceWorker.register(script, { scope: "/", updateViaCache: "none" }).catch(() => {
        // offline support is a bonus; never break the page over it
      });
    }

    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  return null;
}
