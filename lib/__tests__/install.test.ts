import { describe, expect, it } from "vitest";
import { INSTALL_SCRIPT, installState } from "../install";

const CHROME = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const base = { standalone: false, installed: false, hasPrompt: false, userAgent: CHROME, maxTouchPoints: 0 };

describe("installState", () => {
  it("says installed when running as the app or after installing", () => {
    expect(installState({ ...base, standalone: true, hasPrompt: true })).toBe("installed");
    expect(installState({ ...base, installed: true })).toBe("installed");
  });

  it("offers the browser's prompt when there is one", () => {
    expect(installState({ ...base, hasPrompt: true })).toBe("prompt");
  });

  it("shows Safari's steps on iPhone and iPad (which reports itself as a Mac with touch)", () => {
    expect(installState({ ...base, userAgent: IPHONE, maxTouchPoints: 5 })).toBe("ios");
    expect(installState({ ...base, userAgent: IPAD, maxTouchPoints: 5 })).toBe("ios");
    expect(installState({ ...base, userAgent: IPAD, maxTouchPoints: 0 })).toBe("manual");
  });

  it("falls back to the browser menu elsewhere", () => {
    expect(installState(base)).toBe("manual");
  });
});

describe("INSTALL_SCRIPT", () => {
  it("keeps the prompt and announces it", () => {
    const listeners: Record<string, (e: Event) => void> = {};
    const fired: string[] = [];
    const win = {
      addEventListener: (type: string, fn: (e: Event) => void) => (listeners[type] = fn),
      dispatchEvent: (e: Event) => fired.push(e.type),
    } as unknown as Window;
    new Function("window", "addEventListener", "dispatchEvent", INSTALL_SCRIPT)(
      win,
      win.addEventListener,
      win.dispatchEvent,
    );
    let prevented = false;
    const prompt = { preventDefault: () => (prevented = true) } as unknown as Event;
    listeners.beforeinstallprompt(prompt);
    expect(prevented).toBe(true);
    expect(win.__installPrompt).toBe(prompt);
    listeners.appinstalled(new Event("appinstalled"));
    expect(win.__installPrompt).toBeNull();
    expect(win.__appInstalled).toBe(true);
    expect(fired).toEqual(["install-prompt", "install-prompt"]);
  });
});
