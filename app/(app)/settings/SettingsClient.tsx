"use client";

import { Moon, Shield, Smartphone, Sun, SunMoon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccountTabs } from "@/components/AccountTabs";
import { AppPage } from "@/components/AppShell";
import { InstallButton } from "@/components/InstallButton";
import { ClearLocalData, ConsentChoice } from "@/components/Privacy";
import { GOAL_CHOICES } from "@/lib/progress";
import { stopSpeaking } from "@/lib/speak";
import { saveSettings, setSoundOn, setTheme, useSettings, useSoundOn, useTheme, type Theme } from "@/lib/storage";

const NEW_PER_DAY = [5, 10, 15, 20] as const;

const THEME_CHOICES: { value: Theme; label: string; icon: ReactNode }[] = [
  { value: "system", label: "System", icon: <SunMoon size={16} aria-hidden="true" /> },
  { value: "light", label: "Light", icon: <Sun size={16} aria-hidden="true" /> },
  { value: "dark", label: "Dark", icon: <Moon size={16} aria-hidden="true" /> },
];

/** Daily practice, sound, appearance, privacy and the local data. Every change is saved at once. */
export function SettingsPage() {
  const settings = useSettings();
  const soundOn = useSoundOn();
  const theme = useTheme();

  return (
    <AppPage title="Settings" intro="Changes are saved straight away, on this device." width="max-w-4xl">
      <AccountTabs />
      <div className="space-y-4">
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
        </section>
      </div>
    </AppPage>
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
      <div className="flex min-w-0 flex-[1_1_15rem] gap-3.5">
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
