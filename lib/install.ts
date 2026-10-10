/**
 * Installing the app from inside it (Settings → Install the app). React-free so the
 * server layout can inline INSTALL_SCRIPT, like the theme script in lib/theme.ts.
 *
 * Chrome, Edge and Android fire `beforeinstallprompt` once the site is installable,
 * often before React has loaded, so INSTALL_SCRIPT runs in <head>, keeps the event on
 * `window.__installPrompt` and announces it with an "install-prompt" event. iOS never
 * fires it: there the button shows Safari's Share → Add to Home Screen steps instead.
 */

/** The browser's install prompt (not in TypeScript's DOM types yet). */
export type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __installPrompt?: InstallPromptEvent | null;
    __appInstalled?: boolean;
  }
}

/** The window event INSTALL_SCRIPT and the button dispatch when the install state changes. */
export const INSTALL_EVENT = "install-prompt";

export const INSTALL_SCRIPT = `addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__installPrompt=e;dispatchEvent(new Event(${JSON.stringify(INSTALL_EVENT)}))});addEventListener("appinstalled",function(){window.__installPrompt=null;window.__appInstalled=true;dispatchEvent(new Event(${JSON.stringify(INSTALL_EVENT)}))});`;

/**
 * installed: running as the installed app, or installed in this visit.
 * prompt: the browser offered its install prompt; the button opens it.
 * ios: iPhone / iPad, where only Share → Add to Home Screen installs.
 * manual: any other browser (Firefox, desktop Safari, or Chrome before it offers the prompt).
 */
export type InstallState = "installed" | "prompt" | "ios" | "manual";

export function installState(env: {
  standalone: boolean;
  installed: boolean;
  hasPrompt: boolean;
  userAgent: string;
  maxTouchPoints: number;
}): InstallState {
  if (env.standalone || env.installed) return "installed";
  if (env.hasPrompt) return "prompt";
  const ios =
    /iPhone|iPad|iPod/.test(env.userAgent) ||
    // iPadOS reports itself as a Mac, but a Mac has no touch screen
    (/Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1);
  return ios ? "ios" : "manual";
}
