"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Choice, Field } from "@/components/ui";
import { CASE_INFO } from "@/lib/cases";
import { randomSeed, sessionParams } from "@/lib/session";
import { saveConfig, useStoredConfig, useStoredStats } from "@/lib/storage";
import {
  ANSWER_MODES,
  GENDER_GROUPS,
  NUMBER_CASES,
  NUMBER_DRILLS,
  SPELL_RANGES,
} from "@/lib/types";
import type {
  AnswerMode,
  Case,
  Config,
  GenderGroup,
  NumberDrill,
  SpellRange,
} from "@/lib/types";

const COUNTS = [10, 20, 30, 50];

const DRILL_INFO: Record<NumberDrill, { title: string; pl: string; blurb: string }> = {
  count: {
    title: "Counting",
    pl: "Liczebnik + rzeczownik",
    blurb: "dwa koty but pięć kotów — put the noun in the case the number asks for.",
  },
  numeral: {
    title: "The numeral",
    pl: "Odmiana liczebnika",
    blurb: "dwa / dwie / dwóch / dwoma — make the number agree with the noun and the case.",
  },
  spell: {
    title: "In words",
    pl: "Zapis słowny",
    blurb: "Write the figure out: 47 → czterdzieści siedem.",
  },
  ordinal: {
    title: "Ordinals",
    pl: "Liczebniki porządkowe",
    blurb: "pierwszy, drugi, trzeci — plus dates and telling the time.",
  },
};

const GENDER_LABELS: Record<GenderGroup, { title: string; blurb: string }> = {
  m: { title: "Masculine", blurb: "kot, dom, student" },
  f: { title: "Feminine", blurb: "kobieta, kawa" },
  n: { title: "Neuter", blurb: "okno, dziecko" },
};

const ANSWER_LABELS: Record<AnswerMode, { title: string; blurb: string }> = {
  typing: { title: "Writing", blurb: "Type the form yourself." },
  choice: { title: "Multiple choice", blurb: "Pick the right form out of four." },
};

const RANGE_LABELS: Record<SpellRange, string> = {
  20: "0–20",
  100: "0–100",
  1000: "0–1000",
  9999: "0–9999",
};

const DEFAULT_CONFIG: Config = {
  kind: "numbers",
  drills: ["count"],
  cases: [...NUMBER_CASES],
  numbers: ["sg"], // the numbers drill never asks for a plural of its own
  mode: "nouns", // unused by the numbers drill
  max: 100,
  count: 20,
  answerMode: "typing",
};

export default function NumbersConfiguratorPage() {
  const router = useRouter();
  const stored = useStoredConfig("numbers");
  const stats = useStoredStats("numbers");
  const [draft, setDraft] = useState<Config | null>(null);

  const config: Config =
    draft ?? (stored?.cases?.length && stored.numbers?.length ? stored : DEFAULT_CONFIG);
  const drills = config.drills?.length ? config.drills : [...NUMBER_DRILLS];

  const setConfig = (update: (current: Config) => Config) => setDraft(update(config));

  const toggleDrill = (drill: NumberDrill) =>
    setConfig((c) => {
      const current = c.drills?.length ? c.drills : [...NUMBER_DRILLS];
      const next = current.includes(drill)
        ? current.filter((x) => x !== drill)
        : [...current, drill];
      return next.length ? { ...c, drills: next } : c;
    });

  const toggleCase = (kase: Case) =>
    setConfig((c) => ({
      ...c,
      cases: c.cases.includes(kase) ? c.cases.filter((x) => x !== kase) : [...c.cases, kase],
    }));

  const toggleGender = (g: GenderGroup) =>
    setConfig((c) => {
      const current = c.genders?.length ? c.genders : [...GENDER_GROUPS];
      const next = current.includes(g) ? current.filter((x) => x !== g) : [...current, g];
      if (next.length === 0) return c;
      return { ...c, genders: next.length === GENDER_GROUPS.length ? undefined : next };
    });

  const start = () => {
    saveConfig("numbers", config);
    router.push(`/practice?${sessionParams(config, randomSeed())}`);
  };

  // only two of the drills let you choose a case; counting and spelling pick their own
  const casesMatter = drills.includes("numeral") || drills.includes("ordinal");
  const ready = config.cases.length > 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-7 sm:px-8 sm:py-10">
      <header className="mb-10">
        <p className="eyebrow">Set up a session</p>
        <h1 className="page-title mt-2">Numbers</h1>
        <p className="mt-3 text-muted">
          Polish numbers push the noun around: 1 leaves it alone, 2–4 pluralise it, 5 and up send
          it to the genitive. Pick what to drill.
        </p>
      </header>

      <div className="space-y-4">
        <Field label="1 · What to drill" hint="Choose one or more.">
          <div className="grid gap-3 sm:grid-cols-2">
            {NUMBER_DRILLS.map((drill) => (
              <Choice
                key={drill}
                selected={drills.includes(drill)}
                onClick={() => toggleDrill(drill)}
              >
                <span className="eyebrow block text-xs">
                  {DRILL_INFO[drill].pl}
                </span>
                <span className="mt-1 block font-medium">{DRILL_INFO[drill].title}</span>
                <span className="mt-1 block text-sm text-muted">{DRILL_INFO[drill].blurb}</span>
              </Choice>
            ))}
          </div>
        </Field>

        {casesMatter ? (
          <Field
            label="2 · Cases"
            hint="Used by the numeral and ordinal drills; counting picks its own."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {NUMBER_CASES.map((kase) => {
                const info = CASE_INFO[kase];
                const stat = stats[kase];
                return (
                  <Choice
                    key={kase}
                    selected={config.cases.includes(kase)}
                    onClick={() => toggleCase(kase)}
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
                onClick={() => setConfig((c) => ({ ...c, cases: [...NUMBER_CASES] }))}
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
        ) : null}

        {drills.includes("spell") ? (
          <Field label="3 · How high" hint="The range the spelling drill draws from.">
            <div className="flex flex-wrap gap-3">
              {SPELL_RANGES.map((max) => (
                <Choice
                  key={max}
                  selected={(config.max ?? 100) === max}
                  onClick={() => setConfig((c) => ({ ...c, max }))}
                >
                  <span className="font-medium tabular-nums">{RANGE_LABELS[max]}</span>
                </Choice>
              ))}
            </div>
          </Field>
        ) : null}

        <Field label="4 · Gender" hint="Which noun genders to count.">
          <div className="grid gap-3 sm:grid-cols-3">
            {GENDER_GROUPS.map((g) => {
              const selected = config.genders?.length ? config.genders.includes(g) : true;
              return (
                <Choice key={g} selected={selected} onClick={() => toggleGender(g)}>
                  <span className="block font-medium">{GENDER_LABELS[g].title}</span>
                  <span className="block text-sm text-muted">{GENDER_LABELS[g].blurb}</span>
                </Choice>
              );
            })}
          </div>
        </Field>

        <Field label="5 · How to answer">
          <div className="grid gap-3 sm:grid-cols-2">
            {ANSWER_MODES.map((answerMode) => (
              <Choice
                key={answerMode}
                selected={(config.answerMode ?? "typing") === answerMode}
                onClick={() => setConfig((c) => ({ ...c, answerMode }))}
              >
                <span className="block font-medium">{ANSWER_LABELS[answerMode].title}</span>
                <span className="block text-sm text-muted">{ANSWER_LABELS[answerMode].blurb}</span>
              </Choice>
            ))}
          </div>
        </Field>

        <Field label="6 · How many sentences">
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

        <button
          type="button"
          onClick={start}
          disabled={!ready}
          className="btn btn-primary btn-lg btn-block"
        >
          Start · {config.count} sentences
        </button>
        {ready ? null : (
          <p className="text-center text-sm text-accent">Pick at least one case.</p>
        )}
      </div>
    </main>
  );
}
