"use client";

import {
  AnswerField,
  ChoiceText,
  ConfiguratorPage,
  CountField,
  toggle,
  toggleNumber,
  useConfigurator,
} from "@/components/Configurator";
import { Choice, Field } from "@/components/ui";
import { TENSE_LABEL } from "@/lib/verbs";
import { TENSES, VERB_TYPES } from "@/lib/types";
import type { Config, GramNumber, Tense, VerbType } from "@/lib/types";

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

const DEFAULT_CONFIG: Config = {
  kind: "verbs",
  tenses: [...TENSES],
  cases: ["nom"], // unused by the verbs drill, but a session needs one
  numbers: ["sg", "pl"],
  mode: "nouns", // unused by the verbs drill
  count: 20,
  answerMode: "typing",
};

export function VerbsPage() {
  const { config, setConfig, start } = useConfigurator("verbs", DEFAULT_CONFIG);
  const tenses = config.tenses?.length ? config.tenses : [...TENSES];

  const toggleTense = (tense: Tense) =>
    setConfig((c) => {
      const next = toggle(c.tenses?.length ? c.tenses : TENSES, tense);
      return next.length ? { ...c, tenses: next } : c;
    });

  return (
    <ConfiguratorPage
      title="Verbs"
      intro={
        <>
          The infinitive and the person are given — conjugate the verb into the blank. ♂ / ♀
          mark the speaker&apos;s gender where the ending depends on it.
        </>
      }
      count={config.count}
      onStart={start}
    >
      <Field label="1 · Tenses" hint="Choose one or more.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TENSES.map((tense) => (
            <Choice key={tense} selected={tenses.includes(tense)} onClick={() => toggleTense(tense)}>
              <span className="eyebrow block text-xs">{TENSE_LABEL[tense]}</span>
              <span className="mt-1 block font-medium">{TENSE_INFO[tense].title}</span>
              <span className="mt-1 block text-sm text-muted">{TENSE_INFO[tense].blurb}</span>
            </Choice>
          ))}
        </div>
      </Field>

      <Field label="2 · Verbs" hint="Reflexive verbs carry “się”.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {VERB_TYPES.map((verbType) => (
            <Choice
              key={verbType}
              selected={(config.verbType ?? "both") === verbType}
              onClick={() => setConfig((c) => ({ ...c, verbType }))}
            >
              <ChoiceText title={VERB_TYPE_LABELS[verbType].title} blurb={VERB_TYPE_LABELS[verbType].blurb} />
            </Choice>
          ))}
        </div>
      </Field>

      <Field label="3 · Person" hint="The imperative only uses ty, my and wy.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["sg", "pl"] as GramNumber[]).map((num) => (
            <Choice
              key={num}
              selected={config.numbers.includes(num)}
              onClick={() => setConfig((c) => toggleNumber(c, num))}
            >
              <ChoiceText title={NUMBER_LABELS[num].title} blurb={NUMBER_LABELS[num].blurb} />
            </Choice>
          ))}
        </div>
      </Field>

      <AnswerField step={4} config={config} setConfig={setConfig} />
      <CountField step={5} config={config} setConfig={setConfig} />
    </ConfiguratorPage>
  );
}
