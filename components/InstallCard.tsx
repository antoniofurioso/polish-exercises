"use client";

import { Smartphone, X } from "lucide-react";
import { useMemo } from "react";
import { InstallButton, useInstallState } from "@/components/InstallButton";
import { useNow } from "@/components/today";
import { BRAND } from "@/lib/brand";
import { offersInstallCard, practiceDay } from "@/lib/install";
import { dayKey } from "@/lib/srs";
import { dismissInstallCard, useInstallCardDismissedOn, useProgress } from "@/lib/storage";

/**
 * On the results screen: a dismissible card offering to add the app to the home
 * screen, through Settings' InstallButton (the browser's prompt, or Safari's steps).
 * Shown on the learner's 2nd, 7th and 15th practice day while the app isn't
 * installed, only where installing is possible (lib/install.ts `offersInstallCard`).
 */
export function InstallCard() {
  const state = useInstallState();
  const dismissedOn = useInstallCardDismissedOn();
  const progress = useProgress();
  const now = useNow();
  const days = useMemo(() => Object.keys(progress.days), [progress.days]);

  if (!now) return null;
  const today = dayKey(now);
  if (!offersInstallCard({ state, dismissedOn, days, today })) return null;

  return (
    <section aria-labelledby="install-card-title" className="card relative flex gap-4 p-5 pr-14">
      <Smartphone size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
      <div className="min-w-0 space-y-3">
        <div>
          <h2 id="install-card-title" className="font-semibold">
            Add {BRAND.name} to your home screen
          </h2>
          <p className="mt-1 text-sm text-muted">One tap to today’s practice, full screen, and it works offline.</p>
        </div>
        <InstallButton />
      </div>
      <button
        type="button"
        onClick={() => dismissInstallCard(practiceDay(days, today))}
        aria-label="Not now"
        title="Not now"
        className="icon-btn absolute right-3 top-3"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </section>
  );
}
