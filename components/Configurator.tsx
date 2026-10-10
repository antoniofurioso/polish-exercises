"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { Choice, Field } from "@/components/ui";
import { CASE_INFO } from "@/lib/cases";
import { randomSeed, sessionParams } from "@/lib/session";
import { saveConfig, useStoredConfig, useStoredStats } from "@/lib/storage";
import { ANSWER_MODES, GENDER_GROUPS } from "@/lib/types";
import type { AnswerMode, Case, Config, ExerciseKind, GenderGroup, GramNumber } from "@/lib/types";

/**
 * The shared parts of the six drill configurators (app/(app)/<drill>/): the
 * draft config on top of the stored one, the frame with the start button, and
 * the steps more than one drill asks (cases, gender, number, answer mode, count).
 */

/** Same signature as a useState setter, but the base is whatever is on screen. */
export type SetConfig = (update: (current: Config) => Config) => void;

/** What every step needs: the config on screen and a way to change it. */
export type ConfigProps = { config: Config; setConfig: SetConfig };

const COUNTS = [10, 20, 30, 50];

const ANSWER_LABELS: Record<AnswerMode, { title: string; blurb: string }> = {
  typing: { title: "Writing", blurb: "Type the form yourself." },
  choice: { title: "Multiple choice", blurb: "Pick the right form out of four." },
};

const GENDER_TITLES: Record<GenderGroup, string> = { m: "Masculine", f: "Feminine", n: "Neuter" };

/**
 * The config on screen: the user's edits, else the drill's last saved config,
 * else its defaults. `start` saves it and opens the session URL with a new seed.
 */
export function useConfigurator(kind: ExerciseKind, defaults: Config) {
  const router = useRouter();
  const stored = useStoredConfig(kind);
  const [draft, setDraft] = useState<Config | null>(null);

  const config: Config =
    draft ?? (stored?.cases?.length && stored.numbers?.length ? stored : defaults);

  const setConfig: SetConfig = (update) => setDraft(update(config));

  const start = () => {
    saveConfig(kind, config);
    router.push(`/practice?${sessionParams(config, randomSeed())}`);
  };

  return { config, setConfig, start };
}

/** Adds the value if absent, removes it if present. */
export const toggle = <T,>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

/** Singular / plural; the last one left stays on. */
export const toggleNumber = (c: Config, num: GramNumber): Config => {
  const next = toggle(c.numbers, num);
  return { ...c, numbers: next.length ? next : c.numbers };
};

/** The page frame: heading, the steps, the start button and why it is disabled. */
export function ConfiguratorPage({
  title,
  intro,
  count,
  onStart,
  ready = true,
  notes,
  children,
}: {
  title: string;
  intro: ReactNode;
  count: number;
  onStart: () => void;
  ready?: boolean;
  /** Shown under the start button, e.g. a `Note` on what is missing. */
  notes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-7 sm:px-8 sm:py-10">
      <header className="mb-10">
        <p className="eyebrow">Set up a session</p>
        <h1 className="page-title mt-2">{title}</h1>
        <p className="mt-3 text-muted">{intro}</p>
      </header>

      <div className="space-y-4">
        {children}

        <button
          type="button"
          onClick={onStart}
          disabled={!ready}
          className="btn btn-primary btn-lg btn-block"
        >
          Start · {count} sentences
        </button>
        {notes}
      </div>
    </main>
  );
}

/** A line under the start button saying what is missing. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="text-center text-sm text-accent">{children}</p>;
}

/** A choice's name and one line under it. */
export function ChoiceText({ title, blurb }: { title: ReactNode; blurb: ReactNode }) {
  return (
    <>
      <span className="block font-medium">{title}</span>
      <span className="block text-sm text-muted">{blurb}</span>
    </>
  );
}

/** The cases a drill offers, each with its lifetime accuracy, plus Select all / Clear. */
export function CaseField({
  step,
  kind,
  cases,
  hint = "Choose one or more.",
  config,
  setConfig,
}: ConfigProps & { step: number; kind: ExerciseKind; cases: readonly Case[]; hint?: string }) {
  const stats = useStoredStats(kind);
  return (
    <Field label={`${step} · Cases`} hint={hint}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cases.map((kase) => {
          const info = CASE_INFO[kase];
          const stat = stats[kase];
          return (
            <Choice
              key={kase}
              selected={config.cases.includes(kase)}
              onClick={() => setConfig((c) => ({ ...c, cases: toggle(c.cases, kase) }))}
            >
              <span className="block font-medium">{info.pl}</span>
              <span className="block text-sm text-muted">
                {info.en} · {info.question}
              </span>
              {stat && stat.total > 0 ? (
                <span className="mt-1 block text-xs text-muted">
                  lifetime {Math.round((stat.correct / stat.total) * 100)}% of {stat.total}
                </span>
              ) : null}
            </Choice>
          );
        })}
      </div>
      <div className="flex gap-3 text-sm">
        <button
          type="button"
          className="link cursor-pointer"
          onClick={() => setConfig((c) => ({ ...c, cases: [...cases] }))}
        >
          Select all
        </button>
        <button
          type="button"
          className="cursor-pointer font-medium text-muted hover:text-foreground"
          onClick={() => setConfig((c) => ({ ...c, cases: [] }))}
        >
          Clear
        </button>
      </div>
    </Field>
  );
}

/** Noun genders; none chosen means all of them, and the last one left stays on. */
export function GenderField({
  step,
  hint,
  blurbs,
  config,
  setConfig,
}: ConfigProps & { step: number; hint: string; blurbs: Record<GenderGroup, ReactNode> }) {
  const toggleGender = (g: GenderGroup) =>
    setConfig((c) => {
      const next = toggle(c.genders?.length ? c.genders : GENDER_GROUPS, g);
      if (next.length === 0) return c;
      return { ...c, genders: next.length === GENDER_GROUPS.length ? undefined : next };
    });

  return (
    <Field label={`${step} · Gender`} hint={hint}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {GENDER_GROUPS.map((g) => (
          <Choice
            key={g}
            selected={config.genders?.length ? config.genders.includes(g) : true}
            onClick={() => toggleGender(g)}
          >
            <ChoiceText title={GENDER_TITLES[g]} blurb={blurbs[g]} />
          </Choice>
        ))}
      </div>
    </Field>
  );
}

/** Singular / Plural side by side, for a step of its own or inside another one. */
export function NumberChoices({ config, setConfig }: ConfigProps) {
  return (
    <div className="flex gap-3">
      {(["sg", "pl"] as GramNumber[]).map((num) => (
        <Choice
          key={num}
          selected={config.numbers.includes(num)}
          onClick={() => setConfig((c) => toggleNumber(c, num))}
          className="flex-1"
        >
          <span className="font-medium">{num === "sg" ? "Singular" : "Plural"}</span>
        </Choice>
      ))}
    </div>
  );
}

/** Typing or multiple choice. */
export function AnswerField({ step, config, setConfig }: ConfigProps & { step: number }) {
  return (
    <Field label={`${step} · How to answer`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ANSWER_MODES.map((answerMode) => (
          <Choice
            key={answerMode}
            selected={(config.answerMode ?? "typing") === answerMode}
            onClick={() => setConfig((c) => ({ ...c, answerMode }))}
          >
            <ChoiceText title={ANSWER_LABELS[answerMode].title} blurb={ANSWER_LABELS[answerMode].blurb} />
          </Choice>
        ))}
      </div>
    </Field>
  );
}

/** Session length: a preset or a custom number from 1 to 200. */
export function CountField({ step, config, setConfig }: ConfigProps & { step: number }) {
  return (
    <Field label={`${step} · How many sentences`}>
      <div className="flex flex-wrap gap-3">
        {COUNTS.map((count) => (
          <Choice
            key={count}
            selected={config.count === count}
            onClick={() => setConfig((c) => ({ ...c, count }))}
            className="w-20 text-center"
          >
            <span className="font-medium">{count}</span>
          </Choice>
        ))}
        <label className="flex min-h-12 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4">
          <span className="text-sm text-muted">custom</span>
          <input
            type="number"
            min={1}
            max={200}
            value={config.count}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                count: Math.min(200, Math.max(1, Number(e.target.value) || 1)),
              }))
            }
            className="w-16 bg-transparent text-right outline-none"
          />
        </label>
      </div>
    </Field>
  );
}
