"use client";

import {
  AnswerField,
  CaseField,
  ConfiguratorPage,
  CountField,
  GenderField,
  Note,
  toggle,
  useConfigurator,
} from "@/components/Configurator";
import { Choice, Field } from "@/components/ui";
import { NUMBER_CASES, NUMBER_DRILLS, SPELL_RANGES } from "@/lib/types";
import type { Config, NumberDrill, SpellRange } from "@/lib/types";

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

export function NumbersPage() {
  const { config, setConfig, start } = useConfigurator("numbers", DEFAULT_CONFIG);
  const drills = config.drills?.length ? config.drills : [...NUMBER_DRILLS];

  const toggleDrill = (drill: NumberDrill) =>
    setConfig((c) => {
      const next = toggle(c.drills?.length ? c.drills : NUMBER_DRILLS, drill);
      return next.length ? { ...c, drills: next } : c;
    });

  // only two of the drills let you choose a case; counting and spelling pick their own
  const casesMatter = drills.includes("numeral") || drills.includes("ordinal");
  const ready = config.cases.length > 0;

  return (
    <ConfiguratorPage
      title="Numbers"
      intro="Polish numbers push the noun around: 1 leaves it alone, 2–4 pluralise it, 5 and up send it to the genitive. Pick what to drill."
      count={config.count}
      onStart={start}
      ready={ready}
      notes={ready ? null : <Note>Pick at least one case.</Note>}
    >
      <Field label="1 · What to drill" hint="Choose one or more.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {NUMBER_DRILLS.map((drill) => (
            <Choice key={drill} selected={drills.includes(drill)} onClick={() => toggleDrill(drill)}>
              <span className="eyebrow block text-xs">{DRILL_INFO[drill].pl}</span>
              <span className="mt-1 block font-medium">{DRILL_INFO[drill].title}</span>
              <span className="mt-1 block text-sm text-muted">{DRILL_INFO[drill].blurb}</span>
            </Choice>
          ))}
        </div>
      </Field>

      {casesMatter ? (
        <CaseField
          step={2}
          kind="numbers"
          cases={NUMBER_CASES}
          hint="Used by the numeral and ordinal drills; counting picks its own."
          config={config}
          setConfig={setConfig}
        />
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

      <GenderField
        step={4}
        hint="Which noun genders to count."
        blurbs={{ m: "kot, dom, student", f: "kobieta, kawa", n: "okno, dziecko" }}
        config={config}
        setConfig={setConfig}
      />

      <AnswerField step={5} config={config} setConfig={setConfig} />
      <CountField step={6} config={config} setConfig={setConfig} />
    </ConfiguratorPage>
  );
}
