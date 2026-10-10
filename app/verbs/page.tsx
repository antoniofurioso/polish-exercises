"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BRAND } from "@/lib/brand";
import { Choice, Field } from "@/components/ui";
import { randomSeed, sessionParams } from "@/lib/session";
import { saveConfig, useStoredConfig } from "@/lib/storage";
import { TENSE_LABEL } from "@/lib/verbs";
import { ANSWER_MODES, TENSES, VERB_TYPES } from "@/lib/types";
import type { AnswerMode, Config, GramNumber, Tense, VerbType } from "@/lib/types";

const COUNTS = [10, 20, 30, 50];

const TENSE_INFO: Record<Tense, { title: string; blurb: string }> = {
  present: {
    title: "Present",
    blurb: "piszę, czytasz, uczymy się — only imperfective verbs have a present.",
  },
  past: {
    title: "Past",
    blurb: "pisałem, napisała, zjedliśmy — the -ł form plus a personal ending.",
  },
  future: {
    title: "Simple future",
    blurb: "napiszę, zrobisz, pójdziemy — a perfective verb's present endings.",
  },
  futureCompound: {
    title: "Compound future",
    blurb: "będę pisać / będę pisał — być + an imperfective verb.",
  },
  imperative: {
    title: "Imperative",
    blurb: "zrób! nie rób! zróbmy! zróbcie! — orders, and why nie takes the imperfective.",
  },
};

const VERB_TYPE_LABELS: Record<VerbType, { title: string; blurb: string }> = {
  plain: { title: "Plain", blurb: "pisać, robić, iść" },
  reflexive: { title: "Reflexive", blurb: "uczyć się, myć się, budzić się" },
  both: { title: "Both", blurb: "mix them" },
};

const NUMBER_LABELS: Record<GramNumber, { title: string; blurb: string }> = {
  sg: { title: "Singular", blurb: "ja, ty, on, ona" },
  pl: { title: "Plural", blurb: "my, wy, oni, one" },
};

const ANSWER_LABELS: Record<AnswerMode, { title: string; blurb: string }> = {
  typing: { title: "Writing", blurb: "Type the form yourself." },
  choice: { title: "Multiple choice", blurb: "Pick the right form out of four." },
};

const DEFAULT_CONFIG: Config = {
  kind: "verbs",
  tenses: [...TENSES],
  cases: ["nom"], // unused by the verbs drill, but a session needs one
  numbers: ["sg", "pl"],
  mode: "nouns", // unused by the verbs drill
  count: 20,
  answerMode: "typing",
};

export default function VerbsConfiguratorPage() {
  const router = useRouter();
  const stored = useStoredConfig("verbs");
  const [draft, setDraft] = useState<Config | null>(null);

  const config: Config =
    draft ?? (stored?.cases?.length && stored.numbers?.length ? stored : DEFAULT_CONFIG);
  const tenses = config.tenses?.length ? config.tenses : [...TENSES];

  const setConfig = (update: (current: Config) => Config) => setDraft(update(config));

  const toggleTense = (tense: Tense) =>
    setConfig((c) => {
      const current = c.tenses?.length ? c.tenses : [...TENSES];
      const next = current.includes(tense)
        ? current.filter((x) => x !== tense)
        : [...current, tense];
      return next.length ? { ...c, tenses: next } : c;
    });

  const toggleNumber = (num: GramNumber) =>
    setConfig((c) => {
      const next = c.numbers.includes(num)
        ? c.numbers.filter((x) => x !== num)
        : [...c.numbers, num];
      return { ...c, numbers: next.length ? next : c.numbers };
    });

  const start = () => {
    saveConfig("verbs", config);
    router.push(`/practice?${sessionParams(config, randomSeed())}`);
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-16">
      <header className="mb-10">
        <Link href="/learn" className="text-sm uppercase tracking-[0.2em] text-accent">
          {BRAND.name}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Verbs</h1>
        <p className="mt-3 text-muted">
          The infinitive and the person are given — conjugate the verb into the blank. ♂ / ♀
          mark the speaker&apos;s gender where the ending depends on it.
        </p>
      </header>

      <div className="space-y-9">
        <Field label="1 · Tenses" hint="Choose one or more.">
          <div className="grid gap-3 sm:grid-cols-2">
            {TENSES.map((tense) => (
              <Choice
                key={tense}
                selected={tenses.includes(tense)}
                onClick={() => toggleTense(tense)}
              >
                <span className="block text-xs uppercase tracking-[0.2em] text-accent">
                  {TENSE_LABEL[tense]}
                </span>
                <span className="mt-1 block font-medium">{TENSE_INFO[tense].title}</span>
                <span className="mt-1 block text-sm text-muted">{TENSE_INFO[tense].blurb}</span>
              </Choice>
            ))}
          </div>
        </Field>

        <Field label="2 · Verbs" hint="Reflexive verbs carry “się”.">
          <div className="grid gap-3 sm:grid-cols-3">
            {VERB_TYPES.map((verbType) => (
              <Choice
                key={verbType}
                selected={(config.verbType ?? "both") === verbType}
                onClick={() => setConfig((c) => ({ ...c, verbType }))}
              >
                <span className="block font-medium">{VERB_TYPE_LABELS[verbType].title}</span>
                <span className="block text-sm text-muted">{VERB_TYPE_LABELS[verbType].blurb}</span>
              </Choice>
            ))}
          </div>
        </Field>

        <Field label="3 · Person" hint="The imperative only uses ty, my and wy.">
          <div className="grid gap-3 sm:grid-cols-2">
            {(["sg", "pl"] as GramNumber[]).map((num) => (
              <Choice
                key={num}
                selected={config.numbers.includes(num)}
                onClick={() => toggleNumber(num)}
              >
                <span className="block font-medium">{NUMBER_LABELS[num].title}</span>
                <span className="block text-sm text-muted">{NUMBER_LABELS[num].blurb}</span>
              </Choice>
            ))}
          </div>
        </Field>

        <Field label="4 · How to answer">
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

        <Field label="5 · How many sentences">
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
