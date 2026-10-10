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

/** The practice days (the learner's 2nd, 7th and 15th day with answers) the install card is offered on. */
export const INSTALL_CARD_DAYS = [2, 7, 15] as const;

/**
 * Which practice day today is: 1 + the local days answered on before `today`.
 * `days` may or may not include today itself.
 */
export function practiceDay(days: readonly string[], today: string): number {
  return 1 + days.filter((day) => day < today).length;
}

/**
 * Whether the results screen offers the install card: only on the practice days in
 * INSTALL_CARD_DAYS (so never on the first visit), only where the app can actually
 * be installed from the page (the browser's prompt, or Safari's steps), and not
 * again on a day it was closed (`dismissedOn`: the practice day it was last closed on, 0 if never).
 */
export function offersInstallCard(env: {
  state: InstallState;
  dismissedOn: number;
  days: readonly string[];
  today: string;
}): boolean {
  if (env.state !== "prompt" && env.state !== "ios") return false;
  const day = practiceDay(env.days, env.today);
  return (INSTALL_CARD_DAYS as readonly number[]).includes(day) && env.dismissedOn < day;
}
