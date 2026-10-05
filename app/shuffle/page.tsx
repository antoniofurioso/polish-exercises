"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Choice, Field } from "@/components/ui";
import { randomSeed, sessionParams } from "@/lib/session";
import { saveConfig, useStoredConfig } from "@/lib/storage";
import { ANSWER_MODES, DRILL_KINDS } from "@/lib/types";
import type { AnswerMode, Config, DrillKind } from "@/lib/types";

const COUNTS = [10, 20, 30, 50];

const DRILL_LABELS: Record<DrillKind, { title: string; blurb: string }> = {
  cases: { title: "Cases", blurb: "Nouns and adjectives in all seven cases." },
  pronouns: { title: "Demonstratives", blurb: "ten / tamten in every case." },
  possessives: { title: "Possessives", blurb: "mój, twój, nasz, wasz, swój…" },
  numbers: { title: "Numbers", blurb: "Counting, numerals, spelling, ordinals." },
  verbs: { title: "Verbs", blurb: "Every tense and the imperative." },
};

const ANSWER_LABELS: Record<AnswerMode, { title: string; blurb: string }> = {
  typing: { title: "Writing", blurb: "Type the form yourself." },
  choice: { title: "Multiple choice", blurb: "Pick the right form out of four." },
};

const DEFAULT_CONFIG: Config = {
  kind: "shuffle",
  cases: ["nom"], // unused by the shuffle, but a session needs one
  numbers: ["sg"],
  mode: "nouns",
  count: 20,
  answerMode: "typing",
};

export default function ShuffleConfiguratorPage() {
  const router = useRouter();
  const stored = useStoredConfig("shuffle");
  const [draft, setDraft] = useState<Config | null>(null);

  const config: Config =
    draft ?? (stored?.cases?.length && stored.numbers?.length ? stored : DEFAULT_CONFIG);
  const mix = config.mix?.length ? config.mix : [...DRILL_KINDS];

  const setConfig = (update: (current: Config) => Config) => setDraft(update(config));

  const toggleDrill = (kind: DrillKind) =>
    setConfig((c) => {
      const current = c.mix?.length ? c.mix : [...DRILL_KINDS];
      const next = current.includes(kind) ? current.filter((x) => x !== kind) : [...current, kind];
      if (next.length === 0) return c;
      return { ...c, mix: next.length === DRILL_KINDS.length ? undefined : next };
    });

  const start = () => {
    saveConfig("shuffle", config);
    router.push(`/practice?${sessionParams(config, randomSeed())}`);
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-16">
      <header className="mb-10">
        <Link href="/" className="text-sm uppercase tracking-[0.2em] text-accent">
          Ćwiczenia
        </Link>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Shuffle</h1>
        <p className="mt-3 text-muted">
          Questions from every exercise, dealt out in random order with all their options on.
        </p>
      </header>

      <div className="space-y-9">
        <Field label="1 · Exercises to mix" hint="Choose one or more.">
          <div className="grid gap-3 sm:grid-cols-2">
            {DRILL_KINDS.map((kind) => (
              <Choice key={kind} selected={mix.includes(kind)} onClick={() => toggleDrill(kind)}>
                <span className="block font-medium">{DRILL_LABELS[kind].title}</span>
                <span className="block text-sm text-muted">{DRILL_LABELS[kind].blurb}</span>
              </Choice>
            ))}
          </div>
        </Field>

        <Field label="2 · How to answer">
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

        <Field label="3 · How many sentences">
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
          className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-medium text-white transition-opacity cursor-pointer"
        >
          Start · {config.count} sentences
        </button>
      </div>
    </main>
  );
}
