import type { Env } from "./env";

/** Resend over plain fetch (plans/phase-4.md §1, §4.3). */
const RESEND = "https://api.resend.com";

/**
 * Resend's 100 emails per UTC day, split into budgets (a `counters` key and a
 * cap each) so that one kind can never starve another: junk sign-ups spend
 * only `codeNew`, and trial reminders always have their own 20.
 */
export const EMAIL_BUDGETS = {
  /** Login codes for addresses with no account. */
  codeNew: { key: "email_new", cap: 50 },
  /** Login codes for existing accounts. */
  codeKnown: { key: "email_known", cap: 30 },
  /** Trial reminders (§11). */
  reminder: { key: "email_reminder", cap: 20 },
} as const;

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

/** An authenticated call to the Resend API (`path` starts with "/"). Throws only if fetch does. */
export function resendFetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${env.RESEND_API_KEY}`);
  if (init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${RESEND}${path}`, { ...init, headers });
}

/** Sends one email from EMAIL_FROM. Never throws: status 0 = network failure. */
export async function sendEmail(
  env: Env,
  msg: EmailMessage,
): Promise<{ ok: true; id: string } | { ok: false; status: number }> {
  if (env.DEV_LOG_EMAIL === "true") {
    console.log(`dev email to ${msg.to}: ${msg.subject}`);
    return { ok: true, id: "dev" };
  }
  try {
    const res = await resendFetch(env, "/emails", {
      method: "POST",
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(msg.headers ? { headers: msg.headers } : {}),
      }),
    });
    if (!res.ok) {
      console.error(`resend: send failed ${res.status}`);
      return { ok: false, status: res.status };
    }
    const body = (await res.json().catch(() => ({}))) as { id?: unknown };
    return { ok: true, id: typeof body.id === "string" ? body.id : "" };
  } catch {
    console.error("resend: send failed (network)");
    return { ok: false, status: 0 };
  }
}

/** The login code email (§4.3): transactional, no unsubscribe link. */
export function loginCodeEmail(to: string, code: string): EmailMessage {
  return {
    to,
    subject: `Your PolishUp code: ${code}`,
    text: [
      `Your PolishUp code is ${code}`,
      "",
      "It is valid for 10 minutes.",
      "",
      "If you did not ask for it, ignore this email.",
    ].join("\n"),
    html: `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a">
<p>Your PolishUp code is</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
<p>It is valid for 10 minutes.</p>
<p style="color:#666">If you did not ask for it, ignore this email.</p>
</body></html>`,
  };
}
