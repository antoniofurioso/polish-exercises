"use client";

import { ArrowLeft, ArrowRight, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  ApiFailure,
  apiEnabled,
  hasAccess,
  signOut,
  startSignIn,
  useAccount,
  verifyCode,
} from "@/lib/account";
import { track } from "@/lib/analytics";
import { BRAND } from "@/lib/brand";
import { plansHref, safeNext } from "@/lib/site";

/** Same text as CONSENT_TEXT_V1 in workers/api/src/contract.ts (imported there for types only). */
const CONSENT_TEXT = "Send me occasional tips and news about PolishUp. You can unsubscribe any time.";

const CODE_LENGTH = 6;

/** "45 seconds", "2 minutes". */
function wait(seconds: number | undefined): string {
  const s = Math.max(1, Math.ceil(seconds ?? 60));
  if (s < 90) return `${s} ${s === 1 ? "second" : "seconds"}`;
  const m = Math.ceil(s / 60);
  return `${m} minutes`;
}

/** An English sentence for a failed call. */
function message(error: unknown): string {
  if (!(error instanceof ApiFailure)) return "Something went wrong. Please try again.";
  switch (error.code) {
    case "invalid_email":
      return "That doesn’t look like an email address. Check it and try again.";
    case "invalid_code":
      return error.attemptsLeft !== undefined
        ? `That code isn’t right. ${error.attemptsLeft} ${error.attemptsLeft === 1 ? "try" : "tries"} left.`
        : "That code isn’t right. Check it and try again.";
    case "code_expired":
      return "That code has expired or was used up. Send a new one.";
    case "rate_limited":
      return `Too many tries. Wait ${wait(error.retryAfter)} and try again.`;
    case "email_unavailable":
      return "We can’t send sign-in emails right now. Please try again later today.";
    case "network":
      return "You seem to be offline. Check your connection and try again.";
    default:
      return "Something went wrong on our side. Please try again.";
  }
}

/**
 * Sign-in with a 6-digit code (plans/phase-4.md §9.4, §10.3): email and the
 * unticked email-tips box, then the code typed here (no magic link, so the
 * installed iOS app keeps its own storage). Then `next` (same-origin paths
 * only), or /plans when the account has no access.
 */
export function SignInPage() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const router = useRouter();
  const account = useAccount();

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [tips, setTips] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Set once verified, so the "already signed in" view doesn't flash before the redirect. */
  const [leaving, setLeaving] = useState(false);

  if (!apiEnabled()) {
    return (
      <Frame title="Sign-in isn’t available here">
        <p className="text-muted">
          This version of {BRAND.name} has no accounts: your progress is saved on this device.
        </p>
        <Link href="/learn" className="btn btn-primary mt-7">
          Go to the app
        </Link>
      </Frame>
    );
  }

  if (account && !leaving) {
    return (
      <Frame title="You’re signed in">
        <p className="text-muted">
          Signed in as <span className="break-all font-semibold text-foreground">{account.email}</span>.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href={next} className="btn btn-primary">
            Continue
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
            Use another email
          </button>
        </div>
      </Frame>
    );
  }

  const send = async (resend: boolean) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    if (!resend) track("sign_in_started", {});
    try {
      await startSignIn(email);
      setCode("");
      setStep("code");
      if (resend) setNotice("We sent a new code. The old one no longer works.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await verifyCode(email, value, tips);
      setLeaving(true);
      track("signed_in", { kind: res.isNew ? "new" : "returning" });
      router.replace(hasAccess(res.entitlement, Date.now()) ? next : plansHref(next));
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  };

  const onEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) void send(false);
  };

  const onCode = (e: FormEvent) => {
    e.preventDefault();
    if (code.length === CODE_LENGTH) void verify(code);
  };

  if (step === "code") {
    return (
      <Frame title="Check your email">
        <p className="text-muted">
          We sent a {CODE_LENGTH}-digit code to <span className="break-all font-semibold text-foreground">{email}</span>.
          It works for 10 minutes.
        </p>
        <form className="mt-7" onSubmit={onCode} noValidate>
          <label htmlFor="signin-code" className="field-label">
            Code
          </label>
          <input
            id="signin-code"
            className="input max-w-[14rem] text-center text-2xl font-semibold tracking-[0.3em]"
            value={code}
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={CODE_LENGTH}
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "signin-error" : undefined}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
              setCode(digits);
              // a pasted or autofilled code goes straight in
              if (digits.length === CODE_LENGTH && digits !== code) void verify(digits);
            }}
          />
          <Messages error={error} notice={notice} />
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-primary" disabled={busy || code.length !== CODE_LENGTH}>
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void send(true)}>
              Send a new code
            </button>
          </div>
        </form>
        <button
          type="button"
          className="link mt-7 inline-flex min-h-11 items-center gap-2 text-sm"
          onClick={() => {
            setStep("email");
            setError(null);
            setNotice(null);
          }}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Use a different email
        </button>
      </Frame>
    );
  }

  return (
    <Frame title={`Sign in to ${BRAND.name}`}>
      <p className="text-muted">
        We’ll email you a code. No password. New here? The same code creates your account.
      </p>
      <form className="mt-7" onSubmit={onEmail} noValidate>
        <label htmlFor="signin-email" className="field-label">
          Email
        </label>
        <input
          id="signin-email"
          type="email"
          className="input"
          value={email}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "signin-error" : undefined}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-foreground-soft">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
            checked={tips}
            onChange={(e) => setTips(e.target.checked)}
          />
          {CONSENT_TEXT}
        </label>
        <Messages error={error} notice={notice} />
        <button type="submit" className="btn btn-primary btn-block mt-6" disabled={busy || email.trim() === ""}>
          <Mail size={18} aria-hidden="true" />
          {busy ? "Sending…" : "Send code"}
        </button>
      </form>
      <p className="mt-6 text-sm text-muted">
        Your progress on this device comes with you.{" "}
        <Link href="/privacy" className="link">
          Privacy policy
        </Link>
      </p>
    </Frame>
  );
}

function Messages({ error, notice }: { error: string | null; notice: string | null }) {
  return (
    <>
      {error ? (
        <p id="signin-error" role="alert" className="mt-3 text-sm font-medium text-accent-strong">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3 text-sm text-muted">
          {notice}
        </p>
      ) : null}
    </>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="container-page flex flex-1 justify-center py-12 sm:py-20">
      <div className="card w-full max-w-md p-6 sm:p-9">
        <h1 className="page-title">{title}</h1>
        <div className="mt-3">{children}</div>
      </div>
    </main>
  );
}
