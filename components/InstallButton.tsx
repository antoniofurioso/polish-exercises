"use client";

import { Check, Download, Share } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { INSTALL_EVENT, installState, type InstallState } from "@/lib/install";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(INSTALL_EVENT, onChange);
  const standalone = window.matchMedia("(display-mode: standalone)");
  standalone.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(INSTALL_EVENT, onChange);
    standalone.removeEventListener("change", onChange);
  };
}

function snapshot(): InstallState {
  return installState({
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    installed: window.__appInstalled === true,
    hasPrompt: !!window.__installPrompt,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  });
}

/** The install state, live; "manual" on the server. Shared with the results screen's InstallCard. */
export const useInstallState = (): InstallState =>
  useSyncExternalStore(subscribe, snapshot, () => "manual" as InstallState);

/**
 * Settings → Install the app. Opens the browser's own install prompt where there is
 * one (Chrome, Edge, Android), shows Safari's steps on iPhone and iPad, and says so
 * once the app is installed. The prompt is caught early by INSTALL_SCRIPT (lib/install.ts).
 */
export function InstallButton() {
  const state = useInstallState();
  const [showSteps, setShowSteps] = useState(false);

  if (state === "installed") {
    return (
      <span className="chip">
        <Check size={15} aria-hidden="true" />
        Installed
      </span>
    );
  }

  if (state === "prompt") {
    const install = async () => {
      const prompt = window.__installPrompt;
      if (!prompt) return;
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch {
        // already used or withdrawn by the browser
      }
      // a prompt can be shown only once; "appinstalled" marks success
      window.__installPrompt = null;
      window.dispatchEvent(new Event(INSTALL_EVENT));
    };
    return (
      <button type="button" className="btn btn-primary btn-sm" onClick={install}>
        <Download size={15} aria-hidden="true" />
        Install
      </button>
    );
  }

  if (state === "ios") {
    return (
      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          aria-expanded={showSteps}
          onClick={() => setShowSteps((v) => !v)}
        >
          <Download size={15} aria-hidden="true" />
          How to install
        </button>
        {showSteps ? (
          <p className="max-w-xs text-sm text-muted">
            In Safari, tap <Share size={14} aria-label="Share" className="inline align-[-2px]" />{" "}
            <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <p className="max-w-xs text-sm text-muted">
      In your browser’s menu, choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
    </p>
  );
}
