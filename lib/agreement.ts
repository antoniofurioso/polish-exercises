import { capitalise, shuffle } from "./generate";
import { normalise, stripDiacritics } from "./grade";
import { PRONOUN_CASES, withinLevel } from "./types";
import type { Case, Gender, GenderGroup, GramNumber, Level, Noun, Tag, Template } from "./types";

/**
 * Shared machinery for the drills where the noun is handed over already
 * declined and the blank is a word that has to agree with it — demonstratives
 * (ten / tamten) and possessives (mój, nasz, jego...).
 */

export const GENDER_WORD: Record<GenderGroup, string> = {
  m: "masculine",
  f: "feminine",
  n: "neuter",
};

/**
 * A handful of simple sentence frames, one trigger per case, kept plain so the
 * only thing being tested is the agreement of the blanked word. Each is
 * levelled like the case it drills in data/templates.json.
 */
const TANGIBLE: Tag[] = ["person", "animal", "object", "vehicle", "text", "food", "drink"];

export const AGREEMENT_TEMPLATES: Template[] = [
  { case: "nom", number: "sg", level: "A1",
    pl: "Tu jest {NP}.", en: "{np} is here.",
    requires: [...TANGIBLE, "placeIn"], note: "The subject of the sentence stays in the nominative." },
  { case: "nom", number: "pl", level: "A1",
    pl: "Tu są {NP}.", en: "{np} are here.",
    requires: [...TANGIBLE, "placeIn"], note: "The subject of the sentence stays in the nominative." },
  { case: "gen", number: "any", level: "A2",
    pl: "Nie ma tu {NP}.", en: "{np} isn't here.",
    enPl: "{np} aren't here.", requires: ["person", "animal", "object", "vehicle", "text"],
    note: "'nie ma' (there isn't) takes the genitive." },
  { case: "dat", number: "any", level: "B1",
    pl: "Przyglądam się {NP}.", en: "I'm looking at {np}.",
    requires: ["person", "animal", "plant"], lemmas: ["dom", "samochód", "rower"],
    excludeLemmas: ["pan", "pani"],
    subject: "1sg", note: "'przyglądać się' takes the dative." },
  { case: "acc", number: "any", level: "A1",
    pl: "Widzę {NP}.", en: "I can see {np}.",
    requires: [...TANGIBLE, "placeIn", "placeTo", "water", "plant"], lemmas: ["okno"],
    subject: "1sg", note: "A direct object takes the accusative." },
  { case: "ins", number: "any", level: "B1",
    pl: "Opiekuję się {NP}.", en: "I take care of {np}.",
    requires: ["family", "animal"], lemmas: ["chłopiec", "ogród", "dom", "mieszkanie"],
    excludeLemmas: ["pająk", "słoń"],
    subject: "1sg", note: "'opiekować się' takes the instrumental." },
  { case: "loc", number: "any", level: "A2",
    pl: "Myślę o {NP}.", en: "I'm thinking about {np}.",
    requires: ["family", "friend", "profession", "animal", "placeIn", "placeTo", "water", "vehicle", "time", "show"],
    lemmas: ["praca", "imię", "projekt"],
    subject: "1sg", note: "'o' (about) takes the locative." },
];

export function agreementTemplatesFor(kase: Case, number: GramNumber, maxLevel?: Level): Template[] {
  return AGREEMENT_TEMPLATES.filter(
    (t) => t.case === kase && (t.number === "any" || t.number === number) && withinLevel(t, maxLevel),
  );
}

/** Fills the English gloss with "<determiner> <noun>", e.g. "this dog", "my dogs". */
export function renderAgreementEnglish(
  tpl: Template,
  noun: Noun,
  determiner: string,
  number: GramNumber,
): string {
  const head = number === "pl" ? noun.enPl : noun.en;
  const np = `${determiner} ${head}`;
  const text = (tpl.enPl && number === "pl" ? tpl.enPl : tpl.en)
    .replace(/\{npDef\}/g, np)
    .replace(/\{npBare\}/g, np)
    .replace(/\{np\}/g, np);
  return capitalise(text);
}

/**
 * Multiple-choice distractors: the same word in other cells of its own
 * paradigm, same-number cells first. Returns [] when the paradigm is too
 * syncretic to offer a real choice.
 */
export function buildAgreementOptions(
  formFor: (gender: Gender, number: GramNumber, kase: Case) => string,
  gender: Gender,
  number: GramNumber,
  kase: Case,
  answers: string[],
  rng: () => number,
  count = 4,
): string[] {
  const correct = answers[0];
  const taken = new Set(answers.map((a) => stripDiacritics(normalise(a))));
  const near: string[] = [];
  const far: string[] = [];

  for (const num of ["sg", "pl"] as GramNumber[]) {
    for (const k of PRONOUN_CASES) {
      if (num === number && k === kase) continue;
      const text = formFor(gender, num, k);
      const label = stripDiacritics(normalise(text));
      if (taken.has(label)) continue;
      taken.add(label);
      (num === number ? near : far).push(text);
    }
  }

  const distractors = [...shuffle(near, rng), ...shuffle(far, rng)].slice(0, count - 1);
  if (distractors.length < 1) return [];
  return shuffle([correct, ...distractors], rng);
}
