"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Choice, Field } from "@/components/ui";
import { CASE_INFO } from "@/lib/cases";
import { OWNER_INFO } from "@/lib/possessives";
import { randomSeed, sessionParams } from "@/lib/session";
import { saveConfig, useStoredConfig, useStoredStats } from "@/lib/storage";
import { ANSWER_MODES, GENDER_GROUPS, POSSESSIVE_CASES, POSSESSIVES } from "@/lib/types";
import type {
  AnswerMode,
  Case,
  Config,
  GenderGroup,
  GramNumber,
  Possessive,
} from "@/lib/types";

const COUNTS = [10, 20, 30, 50];

const OWNER_BLURB: Record<Possessive, string> = {
  moj: "my — declines like twój",
  twoj: "your (one person)",
  jego: "his / its — never changes",
  jej: "her — never changes",
  nasz: "our — declines like wasz",
  wasz: "your (more than one)",
  ich: "their — never changes",
  swoj: "own, pointing back at the subject — no nominative",
};

const GENDER_LABELS: Record<GenderGroup, { title: string; blurb: string }> = {
  m: { title: "Masculine", blurb: "mój pan, mój kot, mój dom" },
  f: { title: "Feminine", blurb: "moja kobieta, moja kawa" },
  n: { title: "Neuter", blurb: "moje okno, moje dziecko" },
};

const ANSWER_LABELS: Record<AnswerMode, { title: string; blurb: string }> = {
  typing: { title: "Writing", blurb: "Type the form yourself." },
  choice: { title: "Multiple choice", blurb: "Pick the right form out of four." },
};

const DEFAULT_CONFIG: Config = {
  kind: "possessives",
  owners: ["moj", "twoj", "nasz", "wasz"],
  cases: ["gen", "acc", "ins", "loc"],
  numbers: ["sg"],
  mode: "nouns", // unused by the possessive drill
  count: 20,
  answerMode: "typing",
};

export default function PossessiveConfiguratorPage() {
  const router = useRouter();
  const stored = useStoredConfig("possessives");
  const stats = useStoredStats("possessives");
  const [draft, setDraft] = useState<Config | null>(null);

  const config: Config =
    draft ?? (stored?.cases?.length && stored.numbers?.length ? stored : DEFAULT_CONFIG);
  const owners = config.owners?.length ? config.owners : [...POSSESSIVES];

  const setConfig = (update: (current: Config) => Config) => setDraft(update(config));

  const toggleOwner = (owner: Possessive) =>
    setConfig((c) => {
      const current = c.owners?.length ? c.owners : [...POSSESSIVES];
      const next = current.includes(owner)
        ? current.filter((x) => x !== owner)
        : [...current, owner];
      return next.length ? { ...c, owners: next } : c;
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

  const toggleNumber = (num: GramNumber) =>
    setConfig((c) => {
      const next = c.numbers.includes(num)
        ? c.numbers.filter((x) => x !== num)
        : [...c.numbers, num];
      return { ...c, numbers: next.length ? next : c.numbers };
    });

  const start = () => {
    saveConfig("possessives", config);
    router.push(`/practice?${sessionParams(config, randomSeed())}`);
  };

  // "swój" only shows up in object position, so it needs a case other than the nominative
  const onlySwoj = owners.length === 1 && owners[0] === "swoj";
  const ready = config.cases.length > 0 && !(onlySwoj && config.cases.every((c) => c === "nom"));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-7 sm:px-8 sm:py-10">
      <header className="mb-10">
        <p className="eyebrow">Set up a session</p>
        <h1 className="page-title mt-2">Possessive pronouns</h1>
        <p className="mt-3 text-muted">
          The noun is given in the right case — put the possessive that agrees with it in the
          blank.
        </p>
      </header>

      <div className="space-y-4">
        <Field label="1 · Whose" hint="Choose one or more.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {POSSESSIVES.map((owner) => (
              <Choice
                key={owner}
                selected={owners.includes(owner)}
                onClick={() => toggleOwner(owner)}
              >
                <span className="block font-medium">{OWNER_INFO[owner].lemma}</span>
                <span className="block text-sm text-muted">{OWNER_BLURB[owner]}</span>
              </Choice>
            ))}
          </div>
        </Field>

        <Field label="2 · Cases" hint="Choose one or more.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {POSSESSIVE_CASES.map((kase) => {
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
              onClick={() => setConfig((c) => ({ ...c, cases: [...POSSESSIVE_CASES] }))}
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

        <Field label="3 · Gender" hint="Which noun genders to drill.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        {config.cases.length === 0 ? (
          <p className="text-center text-sm text-accent">Pick at least one case.</p>
        ) : null}
        {onlySwoj && config.cases.every((c) => c === "nom") ? (
          <p className="text-center text-sm text-accent">
            &quot;Swój&quot; never stands in the subject — add another case or another possessive.
          </p>
        ) : null}
      </div>
    </main>
  );
}
