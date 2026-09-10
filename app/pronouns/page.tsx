"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Choice, Field } from "@/components/ui";
import { CASE_INFO } from "@/lib/cases";
import { randomSeed, sessionParams } from "@/lib/session";
import { saveConfig, useStoredConfig, useStoredStats } from "@/lib/storage";
import { ANSWER_MODES, GENDER_GROUPS, PRONOUN_CASES } from "@/lib/types";
import type {
  AnswerMode,
  Case,
  Config,
  DemoChoice,
  GenderGroup,
  GramNumber,
} from "@/lib/types";

const COUNTS = [10, 20, 30, 50];

const DEMO_LABELS: Record<DemoChoice, { title: string; blurb: string }> = {
  ten: { title: "ten / ta / to", blurb: "this — the near demonstrative." },
  tamten: { title: "tamten / tamta / tamto", blurb: "that — the far demonstrative." },
  both: { title: "Both", blurb: "Mix ten and tamten." },
};

const GENDER_LABELS: Record<GenderGroup, { title: string; blurb: string }> = {
  m: { title: "Masculine", blurb: "ten pan, ten kot, ten dom" },
  f: { title: "Feminine", blurb: "ta kobieta, ta kawa" },
  n: { title: "Neuter", blurb: "to okno, to dziecko" },
};

const ANSWER_LABELS: Record<AnswerMode, { title: string; blurb: string }> = {
  typing: { title: "Writing", blurb: "Type the form yourself." },
  choice: { title: "Multiple choice", blurb: "Pick the right form out of four." },
};

const DEFAULT_CONFIG: Config = {
  kind: "pronouns",
  demo: "both",
  cases: ["gen", "acc", "ins", "loc"],
  numbers: ["sg"],
  mode: "nouns", // unused by the pronoun drill
  count: 20,
  answerMode: "typing",
};

export default function PronounConfiguratorPage() {
  const router = useRouter();
  const stored = useStoredConfig("pronouns");
  const stats = useStoredStats("pronouns");
  const [draft, setDraft] = useState<Config | null>(null);

  const config: Config =
    draft ?? (stored?.cases?.length && stored.numbers?.length ? stored : DEFAULT_CONFIG);

  const setConfig = (update: (current: Config) => Config) => setDraft(update(config));

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

  const toggleNumber = (num: GramNumber) =>
    setConfig((c) => {
      const next = c.numbers.includes(num)
        ? c.numbers.filter((x) => x !== num)
        : [...c.numbers, num];
      return { ...c, numbers: next.length ? next : c.numbers };
    });

  const start = () => {
    saveConfig("pronouns", config);
    router.push(`/practice?${sessionParams(config, randomSeed())}`);
  };

  const ready = config.cases.length > 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-16">
      <header className="mb-10">
        <Link href="/" className="text-sm uppercase tracking-[0.2em] text-accent">
          Ćwiczenia
        </Link>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Demonstrative pronouns</h1>
        <p className="mt-3 text-muted">
          The noun is given in the right case — put the demonstrative that agrees with it in the
          blank.
        </p>
      </header>

      <div className="space-y-9">
        <Field label="1 · Which word">
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(DEMO_LABELS) as DemoChoice[]).map((demo) => (
              <Choice
                key={demo}
                selected={(config.demo ?? "both") === demo}
                onClick={() => setConfig((c) => ({ ...c, demo }))}
              >
                <span className="block font-medium">{DEMO_LABELS[demo].title}</span>
                <span className="block text-sm text-muted">{DEMO_LABELS[demo].blurb}</span>
              </Choice>
            ))}
          </div>
        </Field>

        <Field label="2 · Cases" hint="Choose one or more.">
          <div className="grid gap-3 sm:grid-cols-2">
            {PRONOUN_CASES.map((kase) => {
              const info = CASE_INFO[kase];
              const stat = stats[kase];
              return (
                <Choice key={kase} selected={config.cases.includes(kase)} onClick={() => toggleCase(kase)}>
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
              className="text-accent underline underline-offset-4 cursor-pointer"
              onClick={() => setConfig((c) => ({ ...c, cases: [...PRONOUN_CASES] }))}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-muted underline underline-offset-4 cursor-pointer"
              onClick={() => setConfig((c) => ({ ...c, cases: [] }))}
            >
              Clear
            </button>
          </div>
        </Field>

        <Field label="3 · Gender" hint="Which noun genders to drill.">
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

        <Field label="4 · Number">
          <div className="flex gap-3">
            {(["sg", "pl"] as GramNumber[]).map((num) => (
              <Choice
                key={num}
                selected={config.numbers.includes(num)}
                onClick={() => toggleNumber(num)}
                className="flex-1"
              >
                <span className="font-medium">{num === "sg" ? "Singular" : "Plural"}</span>
              </Choice>
            ))}
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
            <label className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3">
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
          className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-medium text-white transition-opacity disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        >
          Start · {config.count} sentences
        </button>
        {!ready ? <p className="text-center text-sm text-accent">Pick at least one case.</p> : null}
      </div>
    </main>
  );
}
