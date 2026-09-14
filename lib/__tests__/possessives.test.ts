import { describe, expect, it } from "vitest";
import { grade } from "../grade";
import {
  buildPossessiveOptions,
  buildPossessiveSession,
  declinePossessive,
} from "../possessives";
import { parseSession, sessionParams } from "../session";
import { POSSESSIVE_CASES } from "../types";
import type { Config, Possessive } from "../types";

describe("declinePossessive", () => {
  it("declines mój across the tricky cells", () => {
    expect(declinePossessive("moj", "mInanim", "sg", "nom")).toBe("mój");
    expect(declinePossessive("moj", "mInanim", "sg", "acc")).toBe("mój");
    expect(declinePossessive("moj", "mAnim", "sg", "acc")).toBe("mojego");
    expect(declinePossessive("moj", "mPers", "sg", "dat")).toBe("mojemu");
    expect(declinePossessive("moj", "mInanim", "sg", "loc")).toBe("moim");
    expect(declinePossessive("moj", "f", "sg", "nom")).toBe("moja");
    expect(declinePossessive("moj", "f", "sg", "acc")).toBe("moją");
    expect(declinePossessive("moj", "f", "sg", "gen")).toBe("mojej");
    expect(declinePossessive("moj", "n", "sg", "nom")).toBe("moje");
    expect(declinePossessive("moj", "n", "sg", "gen")).toBe("mojego");
    expect(declinePossessive("moj", "mPers", "pl", "nom")).toBe("moi");
    expect(declinePossessive("moj", "f", "pl", "nom")).toBe("moje");
    expect(declinePossessive("moj", "mPers", "pl", "acc")).toBe("moich");
    expect(declinePossessive("moj", "n", "pl", "ins")).toBe("moimi");
  });

  it("shares the paradigm with twój and swój", () => {
    expect(declinePossessive("twoj", "mInanim", "sg", "nom")).toBe("twój");
    expect(declinePossessive("twoj", "f", "sg", "ins")).toBe("twoją");
    expect(declinePossessive("swoj", "mAnim", "sg", "acc")).toBe("swojego");
    expect(declinePossessive("swoj", "mPers", "pl", "nom")).toBe("swoi");
  });

  it("declines nasz and wasz, softening sz before the virile plural", () => {
    expect(declinePossessive("nasz", "mInanim", "sg", "nom")).toBe("nasz");
    expect(declinePossessive("nasz", "mAnim", "sg", "acc")).toBe("naszego");
    expect(declinePossessive("nasz", "mInanim", "sg", "acc")).toBe("nasz");
    expect(declinePossessive("nasz", "f", "sg", "acc")).toBe("naszą");
    expect(declinePossessive("nasz", "f", "sg", "gen")).toBe("naszej");
    expect(declinePossessive("nasz", "n", "sg", "nom")).toBe("nasze");
    expect(declinePossessive("nasz", "mInanim", "sg", "ins")).toBe("naszym");
    expect(declinePossessive("nasz", "mPers", "pl", "nom")).toBe("nasi");
    expect(declinePossessive("wasz", "mPers", "pl", "nom")).toBe("wasi");
    expect(declinePossessive("wasz", "f", "pl", "nom")).toBe("wasze");
    expect(declinePossessive("wasz", "mPers", "pl", "acc")).toBe("waszych");
    expect(declinePossessive("wasz", "n", "pl", "ins")).toBe("waszymi");
  });

  it("leaves jego, jej and ich untouched in every cell", () => {
    for (const owner of ["jego", "jej", "ich"] as Possessive[]) {
      for (const kase of POSSESSIVE_CASES) {
        expect(declinePossessive(owner, "f", "sg", kase)).toBe(owner);
        expect(declinePossessive(owner, "mPers", "pl", kase)).toBe(owner);
      }
    }
  });
});

const base: Config = {
  kind: "possessives",
  owners: ["moj", "twoj", "jego", "jej", "nasz", "wasz", "ich"],
  cases: [...POSSESSIVE_CASES],
  numbers: ["sg", "pl"],
  mode: "nouns",
  count: 48,
  answerMode: "typing",
};

describe("buildPossessiveSession", () => {
  it("blanks the possessive and accepts that form", () => {
    const session = buildPossessiveSession(base, 7);
    expect(session).toHaveLength(base.count);
    for (const ex of session) {
      expect(ex.tokens.filter((t) => t.blank)).toHaveLength(1);
      expect(grade(ex.answers[0], ex)).toBe("correct");
      expect(POSSESSIVE_CASES as readonly string[]).toContain(ex.case);
    }
  });

  it("is deterministic for a seed", () => {
    const render = (seed: number) =>
      buildPossessiveSession(base, seed).map((e) => `${e.before}${e.answers[0]}${e.after}`);
    expect(render(21)).toEqual(render(21));
  });

  it("accepts swój wherever the owner is the subject", () => {
    const session = buildPossessiveSession({ ...base, owners: ["moj"], count: 30 }, 3);
    const withSubject = session.filter((e) => e.case !== "nom" && e.case !== "gen");
    expect(withSubject.length).toBeGreaterThan(0);
    for (const ex of withSubject) {
      expect(ex.answers).toHaveLength(2);
      expect(grade(ex.answers[1], ex)).toBe("correct");
      expect(ex.answers[1].startsWith("swo")).toBe(true);
    }
  });

  it("keeps swój out of the nominative, falling back to another owner", () => {
    const session = buildPossessiveSession(
      { ...base, owners: ["swoj", "nasz"], cases: ["nom"], count: 12 },
      5,
    );
    expect(session).toHaveLength(12);
    for (const ex of session) {
      expect(ex.answers[0].startsWith("sw")).toBe(false);
    }
  });

  it("drops to the chosen genders only", () => {
    const session = buildPossessiveSession({ ...base, genders: ["n"], count: 12 }, 9);
    for (const ex of session) {
      expect(ex.hint).toContain("neuter");
    }
  });
});

describe("buildPossessiveOptions", () => {
  it("offers cells of the same paradigm", () => {
    const options = buildPossessiveOptions("nasz", "f", "sg", "acc", ["naszą"], () => 0.5);
    expect(options).toHaveLength(4);
    expect(options).toContain("naszą");
    expect(new Set(options).size).toBe(4);
  });

  it("sets an indeclinable possessive against the other two", () => {
    const options = buildPossessiveOptions("jej", "f", "sg", "gen", ["jej"], () => 0.5);
    expect(options.sort()).toEqual(["ich", "jego", "jej"]);
  });

  it("fills options into a choice-mode session", () => {
    const session = buildPossessiveSession({ ...base, answerMode: "choice", count: 20 }, 11);
    for (const ex of session) {
      expect(ex.options?.length ?? 0).toBeGreaterThan(1);
      expect(ex.options).toContain(ex.answers[0]);
    }
  });
});

describe("session round-trip", () => {
  it("carries the kind and the chosen owners through the URL", () => {
    const config: Config = { ...base, owners: ["moj", "ich"], count: 10 };
    const parsed = parseSession(new URLSearchParams(sessionParams(config, 42)));
    expect(parsed?.config.kind).toBe("possessives");
    expect(parsed?.config.owners).toEqual(["moj", "ich"]);
    expect(parsed?.seed).toBe(42);
  });

  it("omits the owners when every one is picked", () => {
    const all: Config = { ...base, owners: ["moj", "twoj", "jego", "jej", "nasz", "wasz", "ich", "swoj"] };
    const parsed = parseSession(new URLSearchParams(sessionParams(all, 1)));
    expect(parsed?.config.owners).toBeUndefined();
  });
});
