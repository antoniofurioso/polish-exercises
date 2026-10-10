"use client";

import { useEffect } from "react";
import { ACCOUNTS_ON } from "@/lib/site";

/**
 * Mounted once in app/layout.tsx: syncs and refreshes the entitlement on app
 * start, `online` and focus (lib/sync.ts `startAutoSync`). lib/sync is
 * imported only when the build has an API, so pages without accounts (and the
 * guides) never load it or the progress logic behind it.
 */
export function AccountSync() {
  useEffect(() => {
    if (!ACCOUNTS_ON) return;
    let cleanup: (() => void) | null = null;
    let alive = true;
    void import("@/lib/sync")
      .then(({ startAutoSync }) => {
        if (alive) cleanup = startAutoSync();
      })
      .catch(() => {});
    return () => {
      alive = false;
      cleanup?.();
    };
  }, []);
  return null;
}
