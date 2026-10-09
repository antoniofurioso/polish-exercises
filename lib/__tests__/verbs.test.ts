import { describe, expect, it } from "vitest";
import verbData from "../../data/verbs.json";
import { renderSolution } from "../generate";
import { grade } from "../grade";
import { loadVerbs } from "../load";
import { parseSession, sessionParams } from "../session";
import { TENSES, VERB_TYPES } from "../types";
import type { AnswerMode, Config, Exercise, GramNumber, Tense } from "../types";
import {
  VERBS,
  buildVerbSession,
  englishClause,
  englishOrder,
  englishPast,
  englishPastCont,
  englishPresent,
  englishPresentCont,
  englishS,
  englishWill,
  englishWillBe,
  futureCompound,
  futureSimple,
  imperative,
  pastForm,
  presentForm,
  withSie,
} from "../verbs";
import type { Verb } from "../verbs";

const verb = (inf: string) => {
  const v = VERBS.find((x) => x.impf.inf === inf || x.pf?.inf === inf);
  if (!v) throw new Error(inf);
  return v.impf.inf === inf ? v.impf : v.pf!;
};
const pf = (inf: string) => VERBS.find((x) => x.pf?.inf === inf)!.pf!;
const pair = (inf: string) =>
  VERBS.find((x) => x.impf.inf === inf || x.pf?.inf === inf)!;

describe("pastForm", () => {
  it("builds the regular paradigm", () => {
    const pisac = verb("pisać");
    expect(pastForm(pisac, 1, "m")).toBe("pisałem");
    expect(pastForm(pisac, 2, "m")).toBe("pisałeś");
    expect(pastForm(pisac, 3, "m")).toBe("pisał");
    expect(pastForm(pisac, 1, "f")).toBe("pisałam");
    expect(pastForm(pisac, 2, "f")).toBe("pisałaś");
    expect(pastForm(pisac, 3, "f")).toBe("pisała");
    expect(pastForm(pisac, 1, "vir")).toBe("pisaliśmy");
    expect(pastForm(pisac, 2, "vir")).toBe("pisaliście");
    expect(pastForm(pisac, 3, "vir")).toBe("pisali");
    expect(pastForm(pisac, 1, "nonvir")).toBe("pisałyśmy");
    expect(pastForm(pisac, 3, "nonvir")).toBe("pisały");
  });

  it("handles the irregular stems", () => {
    expect(pastForm(verb("iść"), 1, "m")).toBe("szedłem");
    expect(pastForm(verb("iść"), 1, "f")).toBe("szłam");
    expect(pastForm(verb("iść"), 3, "nonvir")).toBe("szły");
    expect(pastForm(verb("pomóc"), 1, "m")).toBe("pomogłem");
    expect(pastForm(verb("pomóc"), 3, "m")).toBe("pomógł");
    expect(pastForm(verb("wziąć"), 1, "m")).toBe("wziąłem");
    expect(pastForm(verb("wziąć"), 1, "f")).toBe("wzięłam");
    expect(pastForm(verb("jeść"), 1, "vir")).toBe("jedliśmy");
    expect(pastForm(verb("obejrzeć"), 3, "vir")).toBe("obejrzeli");
  });
});

describe("futureSimple", () => {
  it("rebuilds the perfective non-past from three parts", () => {
    expect(futureSimple(pair("zrobić"), 1, "sg")).toBe("zrobię");
    expect(futureSimple(pair("zrobić"), 3, "sg")).toBe("zrobi");
    expect(futureSimple(pair("zrobić"), 1, "pl")).toBe("zrobimy");
    expect(futureSimple(pair("zjeść"), 3, "pl")).toBe("zjedzą");
    expect(futureSimple(pair("zjeść"), 2, "pl")).toBe("zjecie");
    expect(futureSimple(pair("wziąć"), 3, "sg")).toBe("weźmie");
    expect(futureSimple(pair("pójść"), 1, "pl")).toBe("pójdziemy");
    expect(futureSimple(pair("dać"), 2, "pl")).toBe("dacie");
    expect(futureSimple(pair("pomóc"), 3, "sg")).toBe("pomoże");
  });
});

describe("presentForm", () => {
  it("rebuilds the imperfective present", () => {
    expect(presentForm(pair("pisać"), 1, "sg")).toBe("piszę");
    expect(presentForm(pair("pisać"), 3, "sg")).toBe("pisze");
    expect(presentForm(pair("brać"), 1, "pl")).toBe("bierzemy");
    expect(presentForm(pair("jeść"), 3, "pl")).toBe("jedzą");
    expect(presentForm(pair("iść"), 2, "pl")).toBe("idziecie");
    expect(presentForm(pair("dawać"), 3, "sg")).toBe("daje");
    expect(presentForm(pair("kłaść się"), 3, "sg")).toBe("kładzie");
  });
});

describe("withSie", () => {
  it("leaves plain verbs alone", () => {
    expect(withSie(pair("pisać"), "piszę")).toEqual(["piszę"]);
  });

  it("puts się after the verb, or before it mid-sentence", () => {
    expect(withSie(pair("uczyć się"), "uczę")).toEqual([
      "uczę się",
      "się uczę",
    ]);
    expect(withSie(pair("uczyć się"), "ucz", { initial: true })).toEqual([
      "ucz się",
    ]);
    expect(withSie(pair("uczyć się"), "będę uczyć")).toEqual([
      "będę się uczyć",
      "będę uczyć się",
    ]);
  });

  it("drops się from the infinitive in the compound future", () => {
    expect(futureCompound(pair("uczyć się").impf, 1, "sg", "f")).toEqual([
      "będę uczyć",
      "będę uczyła",
    ]);
  });
});

describe("futureCompound", () => {
  it("accepts both the infinitive and the -ł form", () => {
    expect(futureCompound(verb("pisać"), 1, "sg", "f")).toEqual([
      "będę pisać",
      "będę pisała",
    ]);
    expect(futureCompound(verb("pisać"), 3, "pl", "vir")).toEqual([
      "będą pisać",
      "będą pisali",
    ]);
    expect(futureCompound(verb("iść"), 2, "sg", "m")).toEqual([
      "będziesz iść",
      "będziesz szedł",
    ]);
  });
});

describe("imperative", () => {
  it("adds -my / -cie to the ty-form", () => {
    expect(imperative(pf("zrobić"), 2, "sg")).toBe("zrób");
    expect(imperative(pf("zrobić"), 1, "pl")).toBe("zróbmy");
    expect(imperative(pf("zrobić"), 2, "pl")).toBe("zróbcie");
    expect(imperative(verb("brać"), 2, "sg")).toBe("bierz");
    expect(imperative(pf("otworzyć"), 2, "pl")).toBe("otwórzcie");
    expect(imperative(pf("pójść"), 2, "sg")).toBeNull();
  });
});

describe("buildVerbSession", () => {
  it("round-trips through the URL", () => {
    const config: Config = {
      kind: "verbs",
      tenses: ["past", "imperative"],
      cases: ["nom"],
      numbers: ["pl"],
      mode: "nouns",
      count: 12,
    };
    const parsed = parseSession(new URLSearchParams(sessionParams(config, 7)));
    expect(parsed?.config.kind).toBe("verbs");
    expect(parsed?.config.tenses).toEqual(["past", "imperative"]);
    expect(parsed?.config.numbers).toEqual(["pl"]);
  });

  it("keeps reflexive and plain verbs apart", () => {
    const base: Config = {
      kind: "verbs",
      cases: ["nom"],
      numbers: ["sg", "pl"],
      mode: "nouns",
      count: 30,
    };
    for (const ex of buildVerbSession({ ...base, verbType: "reflexive" }, 3)) {
      expect(ex.answers[0]).toMatch(/się/);
    }
    for (const ex of buildVerbSession({ ...base, verbType: "plain" }, 3)) {
      expect(ex.answers[0]).not.toMatch(/się/);
    }
    const parsed = parseSession(
      new URLSearchParams(sessionParams({ ...base, verbType: "reflexive" }, 1)),
    );
    expect(parsed?.config.verbType).toBe("reflexive");
  });

  it("fills every session, grades its own answers right, and keeps options honest", () => {
    const tenseSets: Tense[][] = [...TENSES.map((t) => [t]), [...TENSES]];
    const numberSets: GramNumber[][] = [["sg"], ["pl"], ["sg", "pl"]];
    const modes: AnswerMode[] = ["typing", "choice"];
    for (const seed of [1, 2, 3, 42, 999]) {
      for (const verbType of VERB_TYPES) {
        for (const tenses of tenseSets) {
          for (const numbers of numberSets) {
            for (const answerMode of modes) {
              const config: Config = {
                kind: "verbs",
                tenses,
                cases: ["nom"],
                numbers,
                mode: "nouns",
                count: 15,
                answerMode,
                verbType,
              };
              const session = buildVerbSession(config, seed);
              expect(session).toHaveLength(15);
              for (const ex of session) {
                expect(numbers).toContain(ex.number);
                for (const a of ex.answers)
                  expect(grade(a, ex)).toBe("correct");
                expect(grade(ex.tokens[0].text, ex)).toBe("correct");
                expect(renderSolution(ex)).not.toMatch(/undefined|\{|\}/);
                expect(ex.en).not.toMatch(/undefined|\{|\}/);
                if (ex.options) {
                  expect(new Set(ex.options).size).toBe(ex.options.length);
                  const right = ex.options.filter(
                    (o) => grade(o, ex) === "correct",
                  );
                  expect(right).toHaveLength(1);
                }
              }
            }
          }
        }
      }
    }
  });
});

// ------------------------------------------------- English, and verb flags

const I = { en: "I", person: 1, number: "sg" } as const;
const YOU = { en: "you", person: 2, number: "sg" } as const;
const SHE = { en: "she", person: 3, number: "sg" } as const;
const WE = { en: "we", person: 1, number: "pl" } as const;
const YOU_ALL = { en: "you all", person: 2, number: "pl" } as const;
const THEY = { en: "they", person: 3, number: "pl" } as const;

const WRITE = { base: "write", past: "wrote", ing: "writing" };
const KNOW = { base: "know", past: "knew", ing: "knowing" };
const LATE = { base: "be late" };
const AFRAID = { base: "be afraid of" };

describe("englishS", () => {
  it("adds -s, -es or -ies to the head verb", () => {
    const cases: [string, string][] = [
      ["write", "writes"],
      ["play", "plays"],
      ["pay", "pays"],
      ["study", "studies"],
      ["try", "tries"],
      ["worry", "worries"],
      ["watch", "watches"],
      ["wash", "washes"],
      ["kiss", "kisses"],
      ["fix", "fixes"],
      ["buzz", "buzzes"],
      ["go", "goes"],
      ["do", "does"],
      ["have", "has"],
      ["be", "is"],
      ["come back", "comes back"],
      ["look after", "looks after"],
      ["get dressed", "gets dressed"],
      ["be late", "is late"],
      ["be interested in", "is interested in"],
    ];
    for (const [base, third] of cases) expect(englishS(base), base).toBe(third);
  });
});

describe("English tenses", () => {
  it("conjugates the present, with 'be' per subject", () => {
    expect(englishPresent(WRITE, I)).toBe("write");
    expect(englishPresent(WRITE, SHE)).toBe("writes");
    expect(
      englishPresent({ base: "study", past: "studied", ing: "studying" }, SHE),
    ).toBe("studies");
    expect(englishPresent(LATE, I)).toBe("am late");
    expect(englishPresent(LATE, YOU)).toBe("are late");
    expect(englishPresent(LATE, SHE)).toBe("is late");
    expect(englishPresent(AFRAID, WE)).toBe("are afraid of");
    expect(englishPresent(AFRAID, THEY)).toBe("are afraid of");
  });

  it("conjugates the past, with was / were for 'be'", () => {
    expect(englishPast(WRITE, SHE)).toBe("wrote");
    expect(englishPast(LATE, I)).toBe("was late");
    expect(englishPast(LATE, SHE)).toBe("was late");
    expect(englishPast(LATE, YOU)).toBe("were late");
    expect(englishPast(AFRAID, YOU_ALL)).toBe("were afraid of");
  });

  it("keeps states and 'be' out of the progressive", () => {
    expect(englishPresentCont(WRITE, I)).toBe("am writing");
    expect(englishPresentCont(WRITE, SHE)).toBe("is writing");
    expect(englishPresentCont(WRITE, YOU_ALL)).toBe("are writing");
    expect(englishPresentCont(KNOW, I, true)).toBe("know");
    expect(englishPresentCont(KNOW, SHE, true)).toBe("knows");
    expect(englishPresentCont(LATE, I)).toBe("am late");
    expect(englishPresentCont(LATE, SHE, true)).toBe("is late");

    expect(englishPastCont(WRITE, I)).toBe("was writing");
    expect(englishPastCont(WRITE, WE)).toBe("were writing");
    expect(englishPastCont(KNOW, WE, true)).toBe("knew");
    expect(englishPastCont(LATE, THEY)).toBe("were late");
  });

  it("builds the future, never 'will be being'", () => {
    expect(englishWill(WRITE)).toBe("will write");
    expect(englishWill(LATE)).toBe("will be late");
    expect(englishWillBe(WRITE)).toBe("will be writing");
    expect(englishWillBe(KNOW, true)).toBe("will know");
    expect(englishWillBe(LATE)).toBe("will be late");
    expect(englishWillBe(AFRAID, true)).toBe("will be afraid of");
  });

  it("gives orders, 'be' ones included", () => {
    expect(englishOrder("write", 2, "sg", false, "a letter")).toBe(
      "Write a letter!",
    );
    expect(englishOrder("write", 2, "pl", true, "a letter")).toBe(
      "Don't write a letter, all of you!",
    );
    expect(englishOrder("be late", 2, "sg", true, "for work")).toBe(
      "Don't be late for work!",
    );
    expect(englishOrder("be late", 1, "pl", true, "for work")).toBe(
      "Let's not be late for work!",
    );
    expect(englishOrder("be afraid of", 2, "pl", true, "dogs")).toBe(
      "Don't be afraid of dogs, all of you!",
    );
    expect(englishOrder("worry", 1, "pl", false, "later")).toBe(
      "Let's worry later!",
    );
  });

  it("puts 'usually' after a form of 'be' only", () => {
    const usually = "{s} usually {v} {o}.";
    expect(englishClause(usually, "he", "works", "at home")).toBe(
      "he usually works at home.",
    );
    expect(englishClause(usually, "he", "is late", "for work")).toBe(
      "he is usually late for work.",
    );
    expect(englishClause(usually, "we", "are afraid of", "dogs")).toBe(
      "we are usually afraid of dogs.",
    );
    expect(englishClause("{s} {v} {o} now.", "I", "am late", "for work")).toBe(
      "I am late for work now.",
    );
  });
});

/** Every verb in data/verbs.json, drafts included, whatever the test project. */
const ALL = loadVerbs(structuredClone(verbData));
const lemma = (inf: string) => {
  const v = ALL.find((x) => x.impf.inf === inf);
  if (!v) throw new Error(inf);
  return v;
};

const session = (verbs: Verb[], tenses: Tense[], seed: number, count = 30) =>
  buildVerbSession(
    {
      kind: "verbs",
      tenses,
      cases: ["nom"],
      numbers: ["sg", "pl"],
      mode: "nouns",
      count,
      answerMode: "choice",
    },
    seed,
    verbs,
  );
const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
const frameOf = (ex: Exercise) => ex.id.split("|")[4];
const infOf = (ex: Exercise) => ex.id.split("|")[1];

describe("verbs without a perfective", () => {
  const impfOnly = ALL.filter((v) => !v.pf);

  it("are in the data and have no simple future", () => {
    expect(impfOnly.length).toBeGreaterThan(5);
    for (const v of impfOnly) expect(futureSimple(v, 1, "sg")).toBeNull();
    for (const seed of seeds) {
      expect(session(impfOnly, ["future"], seed)).toEqual([]);
    }
  });

  it("never take a perfective frame", () => {
    for (const seed of seeds) {
      for (const ex of session(impfOnly, ["past"], seed)) {
        expect(["Wczoraj", "W sobotę"]).not.toContain(frameOf(ex));
      }
    }
  });

  it("still fill a session in every other tense, and grade their own answers", () => {
    const tenses: Tense[] = ["present", "past", "futureCompound", "imperative"];
    for (const tense of tenses) {
      for (const seed of seeds) {
        const built = session(impfOnly, [tense], seed);
        expect(built, `${tense} ${seed}`).toHaveLength(30);
        for (const ex of built) {
          for (const a of ex.answers) expect(grade(a, ex)).toBe("correct");
          const right = (ex.options ?? ex.answers.slice(0, 1)).filter(
            (o) => grade(o, ex) === "correct",
          );
          expect(right).toHaveLength(1);
        }
      }
    }
  });

  it("fill a simple-future session from the few verbs that have one", () => {
    // one perfective pair among imperfective-only verbs: the session still fills
    const pool = [...impfOnly, lemma("pisać")];
    for (const seed of seeds) {
      const built = session(pool, ["future"], seed, 20);
      expect(built).toHaveLength(20);
      for (const ex of built) expect(infOf(ex)).toBe("napisać");
    }
  });

  it("give orders in the imperfective", () => {
    for (const seed of seeds) {
      for (const ex of session([lemma("pamiętać")], ["imperative"], seed, 6)) {
        // "affirmative" orders only: Pamiętaj o kluczach!
        expect(ex.before).toBe("");
        expect(ex.answers[0]).toMatch(/^pamiętaj/);
        expect(ex.en).toMatch(/^(Remember|Let's remember) /);
      }
    }
  });
});

describe("indeterminate motion: chodzić, jeździć", () => {
  const verbs = ["chodzić", "jeździć"].map(lemma);

  it("only takes habits, never one trip now", () => {
    const allowed: [Tense, string[]][] = [
      ["present", ["Codziennie", "Zwykle"]],
      ["past", ["Codziennie", "Wtedy"]],
      ["futureCompound", ["Od jutra codziennie"]],
    ];
    for (const [tense, frames] of allowed) {
      const seen = new Set<string>();
      for (const seed of seeds) {
        for (const ex of session(verbs, [tense], seed)) seen.add(frameOf(ex));
      }
      expect([...seen].sort()).toEqual([...frames].sort());
    }
  });

  it("only forbids: nie chodź!", () => {
    for (const seed of seeds) {
      for (const ex of session(verbs, ["imperative"], seed, 10)) {
        expect(ex.before).toBe("Nie ");
        expect(ex.en).toMatch(/^(Don't|Let's not) go /);
      }
    }
  });

  it("goes, in the English third person", () => {
    const she = seeds
      .flatMap((seed) => session([lemma("chodzić")], ["present"], seed))
      .filter((ex) => ex.hint.endsWith("ona"));
    expect(she.length).toBeGreaterThan(0);
    for (const ex of she) expect(ex.en).toMatch(/she (usually )?goes /i);
  });
});

describe("stative verbs", () => {
  const statives = ALL.filter((v) => v.stative);

  it("are in the data", () => {
    expect(statives.map((v) => v.impf.inf)).toEqual(
      expect.arrayContaining(["rozumieć", "wiedzieć", "znać", "lubić", "kochać", "widzieć"]),
    );
  });

  it("keep the English simple and drop duration and habit", () => {
    const banned = ["Cały wieczór", "Codziennie", "Zwykle", "Jutro cały dzień", "Wieczorem"];
    for (const tense of TENSES) {
      for (const seed of seeds) {
        for (const ex of session(statives, [tense], seed)) {
          expect(banned).not.toContain(frameOf(ex));
          expect(ex.en, ex.id).not.toMatch(/\b(am|is|are|was|were|be) \w+ing\b/);
        }
      }
    }
  });

  it("say 'I understand now', 'I am afraid of dogs now'", () => {
    const now = (inf: string) =>
      seeds
        .flatMap((seed) => session([lemma(inf)], ["present"], seed))
        .filter((ex) => frameOf(ex) === "Teraz");
    const understand = now("rozumieć");
    const afraid = now("bać się");
    expect(understand.length).toBeGreaterThan(0);
    expect(afraid.length).toBeGreaterThan(0);
    for (const ex of understand) {
      expect(ex.en).toMatch(/^(I|You|He|She|We|You all|They) understands? .* now\.$/);
    }
    for (const ex of afraid) {
      expect(ex.en).toMatch(/^(I am|You are|He is|She is|We are|You all are|They are) afraid of .* now\.$/);
    }
  });
});

describe("'be' verbs: spóźniać się", () => {
  it("uses am / was / will be, and only forbids being late", () => {
    const verb = lemma("spóźniać się");
    const all = TENSES.flatMap((t) =>
      seeds.flatMap((seed) => session([verb], [t], seed, 10)),
    );
    for (const ex of all) {
      expect(ex.en).toMatch(/\b(am|is|are|was|were|be) (usually )?late\b/);
      expect(ex.en).not.toMatch(/being|usually (am|is|are)\b/);
      if (ex.id.startsWith("imp")) expect(ex.en).toMatch(/^(Don't|Let's not) be late/);
    }
  });
});

describe("loadVerbs", () => {
  const [base] = structuredClone(verbData) as Record<string, unknown>[];
  const without = (key: string) => {
    const copy = { ...base };
    delete copy[key];
    return copy;
  };

  it("takes a verb without a perfective", () => {
    const [verb] = loadVerbs([without("pf")]);
    expect(verb.pf).toBeUndefined();
  });

  it("wants past and -ing forms, except on a 'be' base", () => {
    expect(() => loadVerbs([{ ...base, en: { base: "make" } }])).toThrow(/en\.past/);
    expect(loadVerbs([{ ...base, en: { base: "be late" } }])[0].en).toEqual({
      base: "be late",
    });
    expect(() =>
      loadVerbs([{ ...base, en: { base: "be late", past: "was late", ing: "being late" } }]),
    ).toThrow(/come from "be"/);
  });

  it("checks the new flags", () => {
    expect(loadVerbs([{ ...base, stative: true }])[0].stative).toBe(true);
    expect(() => loadVerbs([{ ...base, stative: false }])).toThrow(/stative/);
    expect(() => loadVerbs([{ ...base, indeterminate: true }])).toThrow(/no "pf"/);
    expect(() => loadVerbs([{ ...base, motion: true, indeterminate: true }])).toThrow(/both/);
    expect(loadVerbs([{ ...base, orders: "negated" }])[0].orders).toBe("negated");
    expect(() => loadVerbs([{ ...base, orders: "never" }])).toThrow(/orders/);
    const noImp = { ...(base.impf as Record<string, unknown>) };
    delete noImp.imp;
    expect(() =>
      loadVerbs([{ ...without("pf"), impf: noImp, orders: "negated" }]),
    ).toThrow(/no imperative/);
  });
});
