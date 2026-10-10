"use client";

import { Download, LogOut, Mail, Moon, Shield, Smartphone, Sun, SunMoon, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AccountTabs } from "@/components/AccountTabs";
import { AppPage } from "@/components/AppShell";
import { InstallButton } from "@/components/InstallButton";
import { ClearLocalData, ConsentChoice } from "@/components/Privacy";
import {
  ApiFailure,
  apiEnabled,
  deleteAccount,
  exportData,
  setConsent as setMarketingConsent,
  signOut,
  useAccount,
} from "@/lib/account";
import { track } from "@/lib/analytics";
import { BRAND } from "@/lib/brand";
import { GOAL_CHOICES } from "@/lib/progress";
import { signInHref } from "@/lib/site";
import { stopSpeaking } from "@/lib/speak";
import { saveSettings, setSoundOn, setTheme, useSettings, useSoundOn, useTheme, type Theme } from "@/lib/storage";

const NEW_PER_DAY = [5, 10, 15, 20] as const;

const THEME_CHOICES: { value: Theme; label: string; icon: ReactNode }[] = [
  { value: "system", label: "System", icon: <SunMoon size={16} aria-hidden="true" /> },
  { value: "light", label: "Light", icon: <Sun size={16} aria-hidden="true" /> },
  { value: "dark", label: "Dark", icon: <Moon size={16} aria-hidden="true" /> },
];

/** The account, daily practice, sound, appearance, privacy and the local data. Every change is saved at once. */
export function SettingsPage() {
  const settings = useSettings();
  const soundOn = useSoundOn();
  const theme = useTheme();
  const accounts = apiEnabled();
  const account = useAccount();

  return (
    <AppPage
      title="Settings"
      intro={account ? "Changes are saved straight away, to your account." : "Changes are saved straight away, on this device."}
      width="max-w-4xl"
    >
      <AccountTabs />
      <div className="space-y-4">
        {accounts ? <AccountGroup /> : null}

        <Group title="Daily practice">
          <Row title="Daily goal" hint="Questions to answer each day for it to count toward your streak.">
            <div className="seg" role="group" aria-label="Daily goal">
              {GOAL_CHOICES.map((g) => (
                <button key={g} type="button" aria-pressed={settings.goal === g} onClick={() => saveSettings({ ...settings, goal: g })}>
                  {g}
                </button>
              ))}
            </div>
          </Row>
          <Row title="New words per day" hint="How many new cards today’s practice may introduce.">
            <div className="seg" role="group" aria-label="New words per day">
              {NEW_PER_DAY.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={settings.newPerDay === n}
                  onClick={() => saveSettings({ ...settings, newPerDay: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </Row>
        </Group>

        <Group title="Sound and look">
          <Row title="Sound" hint="The right and wrong cues, and each sentence read aloud after you answer.">
            <button
              type="button"
              role="switch"
              aria-checked={soundOn}
              aria-label="Sound"
              className="switch"
              onClick={() => {
                if (soundOn) stopSpeaking();
                setSoundOn(!soundOn);
              }}
            />
          </Row>
          <Row title="Appearance" hint="System follows your device’s light or dark setting.">
            <div className="seg" role="group" aria-label="Appearance">
              {THEME_CHOICES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={theme === t.value}
                  onClick={() => setTheme(t.value)}
                  className="inline-flex items-center gap-1.5"
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          </Row>
        </Group>

        <Group title="App and privacy">
          <Row
            icon={<Smartphone size={20} aria-hidden="true" />}
            title="Install the app"
            hint="On your home screen, it opens straight into today’s practice and works offline."
          >
            <InstallButton />
          </Row>
          <Row
            icon={<Shield size={20} aria-hidden="true" />}
            title="Usage statistics"
            hint={
              <>
                Counts only, never what you type.{" "}
                <Link href="/privacy" className="link">
                  Privacy policy
                </Link>
              </>
            }
            stacked
          >
            <ConsentChoice />
          </Row>
        </Group>

        <section aria-labelledby="danger-title" className="rounded-[1.25rem] border border-accent-line bg-surface px-6 py-6 sm:px-7">
          <h2 id="danger-title" className="label-caps text-accent-strong">
            Your data
          </h2>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0 flex-[1_1_15rem]">
              <p className="font-semibold">Delete everything from this device</p>
              <p className="text-sm text-muted">Your progress, streak, profile and settings. This can’t be undone.</p>
            </div>
            <ClearLocalData />
          </div>
          {accounts ? <DeleteAccount /> : null}
        </section>
      </div>
    </AppPage>
  );
}

/** Email, sign out, the email-tips opt-in and the export (plans/phase-4.md §13.3). */
function AccountGroup() {
  const account = useAccount();
  const [busy, setBusy] = useState<"tips" | "export" | "signout" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!account) {
    return (
      <Group title="Account">
        <Row
          icon={<UserRound size={20} aria-hidden="true" />}
          title="Sign in"
          hint="Keep your progress, settings and name on every device. Your progress on this device comes with you."
        >
          <Link href={signInHref("/settings")} className="btn btn-primary">
            Sign in
          </Link>
        </Row>
      </Group>
    );
  }

  const tips = account.user?.marketingConsent ?? false;
  const fail = (e: unknown) =>
    setError(
      e instanceof ApiFailure && e.code === "network"
        ? "You seem to be offline. Try again when you’re connected."
        : "That didn’t work. Please try again.",
    );

  const toggleTips = async () => {
    setBusy("tips");
    setError(null);
    try {
      await setMarketingConsent(!tips);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setBusy("export");
    setError(null);
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${BRAND.name.toLowerCase()}-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Group title="Account">
      <Row
        icon={<UserRound size={20} aria-hidden="true" />}
        title="Signed in"
        hint={<span className="break-all">{account.email}</span>}
      >
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy !== null}
          onClick={() => {
            setBusy("signout");
            void signOut().finally(() => setBusy(null));
          }}
        >
          <LogOut size={18} aria-hidden="true" />
          Sign out
        </button>
      </Row>
      <Row
        icon={<Mail size={20} aria-hidden="true" />}
        title="Email tips"
        hint="Occasional tips and news about PolishUp. Sign-in codes and receipts come either way."
      >
        <button
          type="button"
          role="switch"
          aria-checked={tips}
          aria-label="Email tips"
          className="switch"
          disabled={busy !== null || !account.user}
          onClick={() => void toggleTips()}
        />
      </Row>
      <Row
        icon={<Download size={20} aria-hidden="true" />}
        title="Export your data"
        hint="Everything your account holds (email, plan, settings, name and every answer), as a JSON file."
      >
        <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => void download()}>
          {busy === "export" ? "Preparing…" : "Download"}
        </button>
      </Row>
      {error ? (
        <p role="alert" className="pb-5 text-sm font-medium text-accent-strong">
          {error}
        </p>
      ) : null}
    </Group>
  );
}

/**
 * Deleting the account (plans/phase-4.md §12): typing the email confirms it;
 * afterwards the device's data is offered for deletion too.
 */
function DeleteAccount() {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  if (deleted) {
    return (
      <div role="status" className="mt-6 border-t border-accent-line pt-6">
        <p className="font-semibold">Your account is deleted.</p>
        <p className="mb-4 text-sm text-muted">
          You’re signed out. Your progress is still on this device; delete it too if you like.
        </p>
        <ClearLocalData />
      </div>
    );
  }
  if (!account) return null;

  const matches = typed.trim().toLowerCase() === account.email.trim().toLowerCase();

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      track("account_deleted", {});
      setDeleted(true);
    } catch (e) {
      setError(
        e instanceof ApiFailure && e.code === "stripe_error"
          ? "We couldn’t cancel your subscription, so nothing was deleted. Please try again."
          : e instanceof ApiFailure && e.code === "network"
            ? "You seem to be offline. Nothing was deleted."
            : "Something went wrong, so nothing was deleted. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 border-t border-accent-line pt-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-[1_1_15rem]">
          <p className="font-semibold">Delete your account</p>
          <p className="text-sm text-muted">
            Your email, synced progress and plan, from our servers. A subscription is cancelled at once, with no
            refund. Lifetime and beta access are lost too.
          </p>
        </div>
        {open ? null : (
          <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
            <Trash2 size={18} aria-hidden="true" />
            Delete account
          </button>
        )}
      </div>
      {open ? (
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (matches && !busy) void remove();
          }}
        >
          <label htmlFor="delete-email" className="field-label">
            Type <span className="break-all">{account.email}</span> to confirm
          </label>
          <input
            id="delete-email"
            type="email"
            className="input max-w-sm"
            value={typed}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setTyped(e.target.value)}
          />
          {error ? (
            <p role="alert" className="mt-3 text-sm font-medium text-accent-strong">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="submit" className="btn btn-danger" disabled={!matches || busy}>
              <Trash2 size={18} aria-hidden="true" />
              {busy ? "Deleting…" : "Delete my account for good"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = `group-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="card px-6 pt-5 sm:px-7">
      <h2 id={id} className="eyebrow text-xs">
        {title}
      </h2>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function Row({
  title,
  hint,
  icon,
  stacked = false,
  children,
}: {
  title: string;
  hint?: ReactNode;
  icon?: ReactNode;
  stacked?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-wrap gap-x-6 gap-y-3 py-5 ${stacked ? "flex-col" : "items-center justify-between"}`}>
      {/* flex-basis would be a height in the stacked (column) layout, so only rows get it */}
      <div className={`flex min-w-0 gap-3.5 ${stacked ? "" : "flex-[1_1_15rem]"}`}>
        {icon ? <span className="mt-0.5 text-accent">{icon}</span> : null}
        <div>
          <p className="font-semibold">{title}</p>
          {hint ? <p className="text-sm text-muted">{hint}</p> : null}
        </div>
      </div>
      <div className={stacked && icon ? "pl-[2.125rem]" : ""}>{children}</div>
    </div>
  );
}
