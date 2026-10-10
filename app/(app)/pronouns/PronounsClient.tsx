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
import { PRONOUN_CASES } from "@/lib/types";
import type { Config, DemoChoice } from "@/lib/types";

const DEMO_LABELS: Record<DemoChoice, { title: string; blurb: string }> = {
  ten: { title: "ten / ta / to", blurb: "this — the near demonstrative." },
  tamten: { title: "tamten / tamta / tamto", blurb: "that — the far demonstrative." },
  both: { title: "Both", blurb: "Mix ten and tamten." },
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

export function PronounsPage() {
  const { config, setConfig, start } = useConfigurator("pronouns", DEFAULT_CONFIG);
  const ready = config.cases.length > 0;

  return (
    <ConfiguratorPage
      title="Demonstrative pronouns"
      intro="The noun is given in the right case — put the demonstrative that agrees with it in the blank."
      count={config.count}
      onStart={start}
      ready={ready}
      notes={ready ? null : <Note>Pick at least one case.</Note>}
    >
      <Field label="1 · Which word">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(Object.keys(DEMO_LABELS) as DemoChoice[]).map((demo) => (
            <Choice
              key={demo}
              selected={(config.demo ?? "both") === demo}
              onClick={() => setConfig((c) => ({ ...c, demo }))}
            >
              <ChoiceText title={DEMO_LABELS[demo].title} blurb={DEMO_LABELS[demo].blurb} />
            </Choice>
          ))}
        </div>
      </Field>

      <CaseField step={2} kind="pronouns" cases={PRONOUN_CASES} config={config} setConfig={setConfig} />

      <GenderField
        step={3}
        hint="Which noun genders to drill."
        blurbs={{ m: "ten pan, ten kot, ten dom", f: "ta kobieta, ta kawa", n: "to okno, to dziecko" }}
        config={config}
        setConfig={setConfig}
      />

      <Field label="4 · Number">
        <NumberChoices config={config} setConfig={setConfig} />
      </Field>

      <AnswerField step={5} config={config} setConfig={setConfig} />
      <CountField step={6} config={config} setConfig={setConfig} />
    </ConfiguratorPage>
  );
}
