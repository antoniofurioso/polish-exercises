import { describe, it } from "vitest";
import { renderSolution } from "../generate";
import { grade } from "../grade";
import { buildNumberSession } from "../numbers";
import { cardinal, declineNumeral, government, ordinal } from "../numerals";
import { CASES, NUMBER_CASES, NUMBER_DRILLS, SPELL_RANGES } from "../types";
import type { AnswerMode, Case, Config, Gender, GenderGroup } from "../types";

/**
 * Brute-force cover for the numbers exercise: the whole config matrix, and the
 * numeral tables swept end to end. The hand-written suites in numbers.test.ts
 * and numerals.test.ts pin down the interesting cells; this one catches the
 * cell nobody thought to name.
 */

const ALL_GENDERS: Gender[] = ["mPers", "mAnim", "mInanim", "f", "n"];

// ---------------------------------------------------------- 1 · session fuzz

describe("buildNumberSession fuzz", () => {
  const seeds = [1, 2, 3, 7, 42, 999];
  const drillSets = [...NUMBER_DRILLS.map((d) => [d]), [...NUMBER_DRILLS]];
  const caseSets: Case[][] = [[...NUMBER_CASES], ["nom"], ["gen", "ins"]];
  const genderSets: (GenderGroup[] | undefined)[] = [undefined, ["m"], ["f"], ["n"]];
  const answerModes: AnswerMode[] = ["typing", "choice"];
  const maxes = [SPELL_RANGES[0], SPELL_RANGES[SPELL_RANGES.length - 1]];
  const count = 10;

  it("holds every invariant across the whole config × seed matrix", () => {
    const failures: string[] = [];
    let combos = 0;

    for (const seed of seeds) {
      for (const drills of drillSets) {
        for (const cases of caseSets) {
          for (const genders of genderSets) {
            for (const answerMode of answerModes) {
              for (const max of maxes) {
                combos++;
                const config: Config = {
                  kind: "numbers",
                  cases,
                  numbers: ["sg"],
                  mode: "nouns",
                  count,
                  drills: drills as Config["drills"],
                  genders,
                  answerMode,
                  max: max as Config["max"],
                };
                const tag = `seed=${seed} drills=${drills} cases=${cases} genders=${genders} mode=${answerMode} max=${max}`;

                let session;
                try {
                  session = buildNumberSession(config, seed);
                } catch (err) {
                  failures.push(`${tag} — threw: ${(err as Error).message}`);
                  continue;
                }

                if (session.length !== count) {
                  failures.push(`${tag} — expected ${count} exercises, got ${session.length}`);
                }

                for (const ex of session) {
                  const rendered = renderSolution(ex);
                  if (/[{}]/.test(rendered)) {
                    failures.push(`${tag} id=${ex.id} — rendered sentence has braces: "${rendered}"`);
                  }
                  if (/undefined/i.test(rendered)) {
                    failures.push(`${tag} id=${ex.id} — rendered sentence has "undefined": "${rendered}"`);
                  }
                  if (!ex.answers[0]) {
                    failures.push(`${tag} id=${ex.id} — empty primary answer`);
                  }

                  const verdict = grade(ex.answers[0], ex);
                  if (verdict !== "correct") {
                    failures.push(
                      `${tag} id=${ex.id} — grading its own answer "${ex.answers[0]}" gave "${verdict}"`,
                    );
                  }

                  if (ex.options) {
                    const uniq = new Set(ex.options);
                    if (uniq.size !== ex.options.length) {
                      failures.push(`${tag} id=${ex.id} — duplicate options: ${JSON.stringify(ex.options)}`);
                    }
                    if (!ex.options.includes(ex.answers[0])) {
                      failures.push(
                        `${tag} id=${ex.id} — options missing the correct answer: ${JSON.stringify(ex.options)} vs "${ex.answers[0]}"`,
                      );
                    }
                  }

                  // count drill: exercise.case/number must reflect the cell the
                  // counted noun actually landed in, per the government rule.
                  if (ex.id.startsWith("count|") && ex.source?.noun) {
                    const [, nStr] = ex.id.split("|");
                    const n = Number(nStr);
                    const gender = ex.source.noun.gender;
                    if (n === 1) {
                      if (ex.number !== "sg") {
                        failures.push(`${tag} id=${ex.id} — n=1 but exercise.number is "${ex.number}"`);
                      }
                    } else {
                      if (ex.number !== "pl") {
                        failures.push(`${tag} id=${ex.id} — n=${n} but exercise.number is "${ex.number}"`);
                      }
                      const gov = government(n, gender);
                      if (gov === "genPl" && ex.case !== "gen") {
                        failures.push(
                          `${tag} id=${ex.id} — government(${n}, ${gender})=genPl but exercise.case="${ex.case}"`,
                        );
                      }
                      if (gov !== "genPl" && ex.case === "gen") {
                        failures.push(
                          `${tag} id=${ex.id} — government(${n}, ${gender})="${gov}" but exercise.case="gen"`,
                        );
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `${failures.length} failure(s) across ${combos} combos:\n` +
          failures.slice(0, 50).join("\n") +
          (failures.length > 50 ? `\n...and ${failures.length - 50} more` : ""),
      );
    }
  });
});

// ------------------------------------------------------- 2 · government/cardinal

describe("government exhaustive 0..9999", () => {
  /** Independently re-derived: 1 -> nomSg; men always collapse to genPl past
   * 1; 2-4 (not 12-14) -> nomPl; everything else -> genPl. */
  function expectedGovernment(n: number, gender: Gender): "nomSg" | "nomPl" | "genPl" {
    if (n === 1) return "nomSg";
    const lastDigit = n % 10;
    const lastTwo = n % 100;
    const isTeenTrap = lastTwo >= 11 && lastTwo <= 19;
    const looksSmall = (lastDigit === 2 || lastDigit === 3 || lastDigit === 4) && !isTeenTrap;
    if (gender === "mPers") return "genPl";
    return looksSmall ? "nomPl" : "genPl";
  }

  it("matches an independently-derived rule for every n and gender", () => {
    const failures: string[] = [];
    for (let n = 0; n <= 9999; n++) {
      for (const gender of ALL_GENDERS) {
        const got = government(n, gender);
        const want = expectedGovernment(n, gender);
        if (got !== want) failures.push(`government(${n}, ${gender}) = ${got}, expected ${want}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`${failures.length} mismatch(es):\n${failures.slice(0, 50).join("\n")}`);
    }
  });
});

describe("cardinal exhaustive 0..9999", () => {
  it("produces a unique spelling for every number", () => {
    const seen = new Map<string, number[]>();
    for (let n = 0; n <= 9999; n++) {
      const word = cardinal(n);
      const list = seen.get(word) ?? [];
      list.push(n);
      seen.set(word, list);
    }
    const collisions = [...seen.entries()].filter(([, ns]) => ns.length > 1);
    if (collisions.length > 0) {
      throw new Error(
        `${collisions.length} colliding spelling(s):\n` +
          collisions
            .slice(0, 20)
            .map(([word, ns]) => `"${word}" <- ${ns.join(", ")}`)
            .join("\n"),
      );
    }
  });

  it("never has leading/trailing/double spaces", () => {
    const failures: string[] = [];
    for (let n = 0; n <= 9999; n++) {
      const word = cardinal(n);
      if (/^\s|\s$/.test(word)) failures.push(`cardinal(${n}) = "${word}" has leading/trailing space`);
      if (/\s{2,}/.test(word)) failures.push(`cardinal(${n}) = "${word}" has a double space`);
    }
    if (failures.length > 0) throw new Error(failures.slice(0, 50).join("\n"));
  });
});

// -------------------------------------------------------- 3 · declineNumeral

describe("declineNumeral over the drilled pools", () => {
  const pool = [
    ...Array.from({ length: 20 }, (_, i) => i + 1), // 1..20
    30, 40, 50, 60, 70, 80, 90, 100,
  ];

  it("never returns an empty array, empty string, undefined text or duplicates", () => {
    const failures: string[] = [];
    for (const n of pool) {
      for (const gender of ALL_GENDERS) {
        for (const kase of NUMBER_CASES) {
          let forms: string[];
          try {
            forms = declineNumeral(n, gender, kase);
          } catch (err) {
            failures.push(`declineNumeral(${n}, ${gender}, ${kase}) threw: ${(err as Error).message}`);
            continue;
          }
          if (forms.length === 0) {
            failures.push(`declineNumeral(${n}, ${gender}, ${kase}) returned []`);
            continue;
          }
          if (forms.some((f) => !f || !f.trim())) {
            failures.push(`declineNumeral(${n}, ${gender}, ${kase}) has an empty entry: ${JSON.stringify(forms)}`);
          }
          if (forms.some((f) => /undefined/i.test(f))) {
            failures.push(`declineNumeral(${n}, ${gender}, ${kase}) has "undefined": ${JSON.stringify(forms)}`);
          }
          const uniq = new Set(forms);
          if (uniq.size !== forms.length) {
            failures.push(`declineNumeral(${n}, ${gender}, ${kase}) has duplicates: ${JSON.stringify(forms)}`);
          }
        }
      }
    }
    if (failures.length > 0) {
      throw new Error(`${failures.length} failure(s):\n${failures.slice(0, 50).join("\n")}`);
    }
  });
});

// ------------------------------------------------------------- 4 · ordinal

describe("ordinal over 1..100", () => {
  it("never returns empty/undefined for any gender, number and case", () => {
    const failures: string[] = [];
    for (let n = 1; n <= 100; n++) {
      for (const gender of ALL_GENDERS) {
        for (const number of ["sg", "pl"] as const) {
          for (const kase of CASES) {
            let form: string;
            try {
              form = ordinal(n, gender, number, kase);
            } catch (err) {
              failures.push(`ordinal(${n}, ${gender}, ${number}, ${kase}) threw: ${(err as Error).message}`);
              continue;
            }
            if (!form || !form.trim()) {
              failures.push(`ordinal(${n}, ${gender}, ${number}, ${kase}) is empty`);
            }
            if (/undefined/i.test(form)) {
              failures.push(`ordinal(${n}, ${gender}, ${number}, ${kase}) has "undefined": "${form}"`);
            }
          }
        }
      }
    }
    if (failures.length > 0) {
      throw new Error(`${failures.length} failure(s):\n${failures.slice(0, 50).join("\n")}`);
    }
  });

  it("declines both halves of a compound ordinal in the genitive, not just the last word", () => {
    const compounds = [21, 32, 45, 58, 67, 79, 84, 93, 99];
    const failures: string[] = [];
    for (const n of compounds) {
      for (const gender of ["mInanim", "f", "n"] as Gender[]) {
        const nom = ordinal(n, gender, "sg", "nom");
        const gen = ordinal(n, gender, "sg", "gen");
        const [nomTens] = nom.split(" ");
        const [genTens] = gen.split(" ");
        if (nomTens === genTens) {
          failures.push(
            `ordinal(${n}, ${gender}): tens word unchanged between nom ("${nom}") and gen ("${gen}")`,
          );
        }
        if (nom.split(" ").length < 2 || gen.split(" ").length < 2) {
          failures.push(`ordinal(${n}, ${gender}) is not a two-word compound: nom="${nom}" gen="${gen}"`);
        }
      }
    }
    if (failures.length > 0) throw new Error(failures.join("\n"));
  });
});

