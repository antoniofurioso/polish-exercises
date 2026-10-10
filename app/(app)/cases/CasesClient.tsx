"use client";

import {
  AnswerField,
  CaseField,
  ChoiceText,
  ConfiguratorPage,
  CountField,
  GenderField,
  Note,
  NumberChoices,
  useConfigurator,
} from "@/components/Configurator";
import { Choice, Field } from "@/components/ui";
import { CASES } from "@/lib/types";
import type { Config, WordMode } from "@/lib/types";

const MODE_LABELS: Record<WordMode, { title: string; blurb: string }> = {
  nouns: { title: "Nouns", blurb: "Decline the noun on its own." },
  adjectives: { title: "Adjectives", blurb: "The noun is given — decline the adjective." },
  both: { title: "Nouns + adjectives", blurb: "Decline the whole phrase." },
};

const DEFAULT_CONFIG: Config = {
  kind: "cases",
  cases: ["gen", "acc", "ins", "loc"],
  numbers: ["sg"],
  mode: "nouns",
  count: 20,
  answerMode: "typing",
};

export function CasesPage() {
  const { config, setConfig, start } = useConfigurator("cases", DEFAULT_CONFIG);
  const ready = config.cases.length > 0;

  return (
    <ConfiguratorPage
      title="Polish case practice"
      intro="Pick what you want to drill, then fill in one sentence at a time."
      count={config.count}
      onStart={start}
      ready={ready}
      notes={ready ? null : <Note>Pick at least one case.</Note>}
    >
      <CaseField step={1} kind="cases" cases={CASES} config={config} setConfig={setConfig} />

      <GenderField
        step={2}
        hint="Which noun genders to drill."
        blurbs={{ m: "pan, kot, dom", f: "kobieta, kawa", n: "okno, dziecko" }}
        config={config}
        setConfig={setConfig}
      />

      <Field label="3 · What to decline">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(Object.keys(MODE_LABELS) as WordMode[]).map((mode) => (
            <Choice key={mode} selected={config.mode === mode} onClick={() => setConfig((c) => ({ ...c, mode }))}>
              <ChoiceText title={MODE_LABELS[mode].title} blurb={MODE_LABELS[mode].blurb} />
            </Choice>
          ))}
        </div>
        <NumberChoices config={config} setConfig={setConfig} />
      </Field>

      <AnswerField step={4} config={config} setConfig={setConfig} />
      <CountField step={5} config={config} setConfig={setConfig} />
    </ConfiguratorPage>
  );
}
