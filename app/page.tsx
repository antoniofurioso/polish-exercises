"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Choice, Field } from "@/components/ui";
import { CASE_INFO } from "@/lib/cases";
import { saveConfig, useStoredConfig, useStoredStats } from "@/lib/storage";
import { CASES } from "@/lib/types";
import type { Case, Config, GramNumber, WordMode } from "@/lib/types";

const COUNTS = [10, 20, 30, 50];

const MODE_LABELS: Record<WordMode, { title: string; blurb: string }> = {
  nouns: { title: "Nouns", blurb: "Decline the noun on its own." },
  adjectives: { title: "Adjectives", blurb: "The noun is given — decline the adjective." },
  both: { title: "Nouns + adjectives", blurb: "Decline the whole phrase." },
};

const DEFAULT_CONFIG: Config = {
  cases: ["gen", "acc", "ins", "loc"],
  numbers: ["sg"],
  mode: "nouns",
  count: 20,
};

export default function ConfiguratorPage() {
  const router = useRouter();
  const stored = useStoredConfig();
  const stats = useStoredStats();
  const [draft, setDraft] = useState<Config | null>(null);

  const config: Config =
    draft ?? (stored?.cases?.length && stored.numbers?.length ? stored : DEFAULT_CONFIG);

  /** Same signature as a useState setter, but the base is whatever is on screen. */
  const setConfig = (update: (current: Config) => Config) => setDraft(update(config));

  const toggleCase = (kase: Case) =>
    setConfig((c) => ({
      ...c,
      cases: c.cases.includes(kase) ? c.cases.filter((x) => x !== kase) : [...c.cases, kase],
    }));

  const toggleNumber = (num: GramNumber) =>
    setConfig((c) => {
      const next = c.numbers.includes(num)
        ? c.numbers.filter((x) => x !== num)
        : [...c.numbers, num];
      return { ...c, numbers: next.length ? next : c.numbers };
    });

  const start = () => {
    saveConfig(config);
    const params = new URLSearchParams({
      cases: config.cases.join(","),
      num: config.numbers.join(","),
      mode: config.mode,
      count: String(config.count),
      seed: String(Math.floor(Math.random() * 1_000_000)),
    });
    router.push(`/practice?${params.toString()}`);
  };

  const ready = config.cases.length > 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-16">
      <header className="mb-10">
        <p className="text-sm uppercase tracking-[0.2em] text-accent">Ćwiczenia</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Polish case practice</h1>
        <p className="mt-3 text-muted">
          Pick what you want to drill, then fill in one sentence at a time.
        </p>
      </header>

      <div className="space-y-9">
        <Field label="1 · Cases" hint="Choose one or more.">
          <div className="grid gap-3 sm:grid-cols-2">
            {CASES.map((kase) => {
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
              onClick={() => setConfig((c) => ({ ...c, cases: [...CASES] }))}
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

        <Field label="2 · What to decline">
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(MODE_LABELS) as WordMode[]).map((mode) => (
              <Choice key={mode} selected={config.mode === mode} onClick={() => setConfig((c) => ({ ...c, mode }))}>
                <span className="block font-medium">{MODE_LABELS[mode].title}</span>
                <span className="block text-sm text-muted">{MODE_LABELS[mode].blurb}</span>
              </Choice>
            ))}
          </div>
          <div className="flex gap-3">
            {(["sg", "pl"] as GramNumber[]).map((num) => (
              <Choice key={num} selected={config.numbers.includes(num)} onClick={() => toggleNumber(num)} className="flex-1">
                <span className="font-medium">{num === "sg" ? "Singular" : "Plural"}</span>
              </Choice>
            ))}
          </div>
        </Field>

        <Field label="3 · How many sentences">
          <div className="flex flex-wrap gap-3">
            {COUNTS.map((count) => (
              <Choice key={count} selected={config.count === count} onClick={() => setConfig((c) => ({ ...c, count }))} className="w-20 text-center">
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
