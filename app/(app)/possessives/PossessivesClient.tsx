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
  toggle,
  useConfigurator,
} from "@/components/Configurator";
import { Choice, Field } from "@/components/ui";
import { OWNER_INFO } from "@/lib/possessives";
import { POSSESSIVE_CASES, POSSESSIVES } from "@/lib/types";
import type { Config, Possessive } from "@/lib/types";

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

const DEFAULT_CONFIG: Config = {
  kind: "possessives",
  owners: ["moj", "twoj", "nasz", "wasz"],
  cases: ["gen", "acc", "ins", "loc"],
  numbers: ["sg"],
  mode: "nouns", // unused by the possessive drill
  count: 20,
  answerMode: "typing",
};

export function PossessivesPage() {
  const { config, setConfig, start } = useConfigurator("possessives", DEFAULT_CONFIG);
  const owners = config.owners?.length ? config.owners : [...POSSESSIVES];

  const toggleOwner = (owner: Possessive) =>
    setConfig((c) => {
      const next = toggle(c.owners?.length ? c.owners : POSSESSIVES, owner);
      return next.length ? { ...c, owners: next } : c;
    });

  // "swój" only shows up in object position, so it needs a case other than the nominative
  const onlySwoj = owners.length === 1 && owners[0] === "swoj";
  const swojInSubject = onlySwoj && config.cases.every((c) => c === "nom");
  const ready = config.cases.length > 0 && !swojInSubject;

  return (
    <ConfiguratorPage
      title="Possessive pronouns"
      intro="The noun is given in the right case — put the possessive that agrees with it in the blank."
      count={config.count}
      onStart={start}
      ready={ready}
      notes={
        <>
          {config.cases.length === 0 ? <Note>Pick at least one case.</Note> : null}
          {swojInSubject ? (
            <Note>&quot;Swój&quot; never stands in the subject — add another case or another possessive.</Note>
          ) : null}
        </>
      }
    >
      <Field label="1 · Whose" hint="Choose one or more.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {POSSESSIVES.map((owner) => (
            <Choice key={owner} selected={owners.includes(owner)} onClick={() => toggleOwner(owner)}>
              <ChoiceText title={OWNER_INFO[owner].lemma} blurb={OWNER_BLURB[owner]} />
            </Choice>
          ))}
        </div>
      </Field>

      <CaseField
        step={2}
        kind="possessives"
        cases={POSSESSIVE_CASES}
        config={config}
        setConfig={setConfig}
      />

      <GenderField
        step={3}
        hint="Which noun genders to drill."
        blurbs={{ m: "mój pan, mój kot, mój dom", f: "moja kobieta, moja kawa", n: "moje okno, moje dziecko" }}
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
