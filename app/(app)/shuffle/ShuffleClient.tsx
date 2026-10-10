"use client";

import {
  AnswerField,
  ChoiceText,
  ConfiguratorPage,
  CountField,
  toggle,
  useConfigurator,
} from "@/components/Configurator";
import { Choice, Field } from "@/components/ui";
import { DRILL_KINDS } from "@/lib/types";
import type { Config, DrillKind } from "@/lib/types";

const DRILL_LABELS: Record<DrillKind, { title: string; blurb: string }> = {
  cases: { title: "Cases", blurb: "Nouns and adjectives in all seven cases." },
  pronouns: { title: "Demonstratives", blurb: "ten / tamten in every case." },
  possessives: { title: "Possessives", blurb: "mój, twój, nasz, wasz, swój…" },
  numbers: { title: "Numbers", blurb: "Counting, numerals, spelling, ordinals." },
  verbs: { title: "Verbs", blurb: "Every tense and the imperative." },
};

const DEFAULT_CONFIG: Config = {
  kind: "shuffle",
  cases: ["nom"], // unused by the shuffle, but a session needs one
  numbers: ["sg"],
  mode: "nouns",
  count: 20,
  answerMode: "typing",
};

export function ShufflePage() {
  const { config, setConfig, start } = useConfigurator("shuffle", DEFAULT_CONFIG);
  const mix = config.mix?.length ? config.mix : [...DRILL_KINDS];

  const toggleDrill = (kind: DrillKind) =>
    setConfig((c) => {
      const next = toggle(c.mix?.length ? c.mix : DRILL_KINDS, kind);
      if (next.length === 0) return c;
      return { ...c, mix: next.length === DRILL_KINDS.length ? undefined : next };
    });

  return (
    <ConfiguratorPage
      title="Shuffle"
      intro="Questions from every exercise, dealt out in random order with all their options on."
      count={config.count}
      onStart={start}
    >
      <Field label="1 · Exercises to mix" hint="Choose one or more.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DRILL_KINDS.map((kind) => (
            <Choice key={kind} selected={mix.includes(kind)} onClick={() => toggleDrill(kind)}>
              <ChoiceText title={DRILL_LABELS[kind].title} blurb={DRILL_LABELS[kind].blurb} />
            </Choice>
          ))}
        </div>
      </Field>

      <AnswerField step={2} config={config} setConfig={setConfig} />
      <CountField step={3} config={config} setConfig={setConfig} />
    </ConfiguratorPage>
  );
}
