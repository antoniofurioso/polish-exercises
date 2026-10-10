"use client";

import { Award, Check, User } from "lucide-react";
import { useMemo, useState } from "react";
import { AccountTabs } from "@/components/AccountTabs";
import { AppPage } from "@/components/AppShell";
import { useTodayStatus } from "@/components/today";
import { DRILLS } from "@/lib/drills";
import { levelCap } from "@/lib/progress";
import { cardsByDrill, milestones, safely, totalAnswered } from "@/lib/progressView";
import { PROFILE_NAME_MAX, saveProfile, useProfile } from "@/lib/storage";
import { DRILL_KINDS } from "@/lib/types";

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

/** The learner's name, numbers and milestones. Everything is on this device until accounts exist. */
export function ProfilePage() {
  const status = useTodayStatus();
  const { hydrated, ready, progress, streak } = status;
  const profile = useProfile();
  const initial = profile.name.charAt(0).toUpperCase();

  const since = useMemo(() => {
    const first = Object.keys(progress.days).sort()[0];
    return first ? MONTH.format(new Date(`${first}T00:00`)) : null;
  }, [progress]);
  const level = useMemo(() => (hydrated && ready ? safely(() => levelCap(progress), null) : null), [hydrated, ready, progress]);
  const byDrill = useMemo(() => cardsByDrill(progress), [progress]);
  const most = Math.max(1, ...Object.values(byDrill));
  const goals = useMemo(() => milestones(progress, streak?.best ?? 0), [progress, streak]);
  const cards = Object.keys(progress.cards).length;

  return (
    <AppPage title="Profile">
      <AccountTabs />
      <section className="card flex flex-wrap items-center gap-6 p-6 sm:p-7">
        <span
          aria-hidden="true"
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-accent-fill text-3xl font-bold text-on-accent"
        >
          {initial || <User size={34} />}
        </span>
        <div className="min-w-56 flex-1">
          <h2 className="text-[1.375rem] font-bold">{profile.name || "Your profile"}</h2>
          <p className="mt-1 text-muted">{since ? `Practising since ${since}` : "No practice yet"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {level ? <span className="chip chip-accent">New cards up to {level}</span> : null}
            <span className="chip">Free · beta</span>
          </div>
        </div>
        <dl className="flex flex-wrap gap-8">
          {[
            { label: "Answers", value: totalAnswered(progress) },
            { label: "Best streak", value: streak?.best ?? 0 },
            { label: "Cards practised", value: cards },
          ].map((s) => (
            <div key={s.label} className="flex flex-col-reverse">
              <dt className="text-[0.8125rem] text-muted">{s.label}</dt>
              <dd className="text-[1.625rem] font-bold">{hydrated ? s.value.toLocaleString("en-GB") : "–"}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="about-title" className="card p-6 sm:p-7">
          <h2 id="about-title" className="text-[1.0625rem] font-semibold">
            About you
          </h2>
          <p className="mt-1 text-sm text-muted">Saved on this device. When accounts arrive, it moves with you.</p>
          {/* remount once storage is read, so the field starts from the saved name */}
          <NameForm key={hydrated ? "stored" : "server"} name={profile.name} />
        </section>

        <section aria-labelledby="drills-title" className="card p-6 sm:p-7">
          <h2 id="drills-title" className="text-[1.0625rem] font-semibold">
            Cards practised, by drill
          </h2>
          <ul className="mt-5 flex flex-col gap-4">
            {DRILL_KINDS.map((kind) => (
              <li key={kind}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{DRILLS[kind].title}</span>
                  <span className="text-muted">{byDrill[kind]}</span>
                </div>
                <div className="meter mt-1.5" aria-hidden="true">
                  <span style={{ width: `${(byDrill[kind] / most) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="miles-title" className="mt-10">
        <h2 id="miles-title" className="text-xl font-semibold">
          Milestones
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((m) => (
            <li key={m.id} className={`card flex items-center gap-3.5 p-5 ${m.reached ? "" : "opacity-60"}`}>
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                  m.reached ? "bg-accent-fill text-on-accent" : "bg-chip text-muted"
                }`}
                aria-hidden="true"
              >
                <Award size={22} strokeWidth={1.75} />
              </span>
              <span>
                <span className="block text-sm font-semibold">{m.title}</span>
                <span className="block text-[0.8125rem] text-muted">
                  {m.detail}
                  {m.reached ? "" : " · not yet"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </AppPage>
  );
}

function NameForm({ name }: { name: string }) {
  const [draft, setDraft] = useState(name);
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="mt-6"
      onSubmit={(e) => {
        e.preventDefault();
        saveProfile({ name: draft });
        setSaved(true);
      }}
    >
      <label htmlFor="profile-name" className="field-label">
        Display name
      </label>
      <input
        id="profile-name"
        className="input max-w-sm"
        value={draft}
        maxLength={PROFILE_NAME_MAX}
        autoComplete="given-name"
        placeholder="What should we call you?"
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
        }}
      />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={draft.trim() === name}>
          Save
        </button>
        {saved ? (
          <span role="status" className="flex items-center gap-1.5 text-sm font-medium text-ok">
            <Check size={16} aria-hidden="true" />
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}
