import { describe, expect, it } from "vitest";
import {
  cardinal,
  countingNumeral,
  declineNumeral,
  englishNumber,
  englishOrdinal,
  government,
  obliqueCardinal,
  ordinal,
  ordinalLemma,
} from "../numerals";

describe("cardinal", () => {
  it("spells the units and the teens", () => {
    expect(cardinal(0)).toBe("zero");
    expect(cardinal(7)).toBe("siedem");
    expect(cardinal(12)).toBe("dwanaście");
    expect(cardinal(19)).toBe("dziewiętnaście");
  });

  it("stacks tens, hundreds and thousands with no glue word", () => {
    expect(cardinal(20)).toBe("dwadzieścia");
    expect(cardinal(21)).toBe("dwadzieścia jeden");
    expect(cardinal(47)).toBe("czterdzieści siedem");
    expect(cardinal(100)).toBe("sto");
    expect(cardinal(258)).toBe("dwieście pięćdziesiąt osiem");
    expect(cardinal(900)).toBe("dziewięćset");
  });

  it("counts the thousands like any other noun", () => {
    expect(cardinal(1000)).toBe("tysiąc");
    expect(cardinal(2000)).toBe("dwa tysiące");
    expect(cardinal(5000)).toBe("pięć tysięcy");
    expect(cardinal(1234)).toBe("tysiąc dwieście trzydzieści cztery");
  });

  it("refuses what it cannot spell", () => {
    expect(() => cardinal(10000)).toThrow();
    expect(() => cardinal(-1)).toThrow();
  });
});

describe("obliqueCardinal", () => {
  it("collapses onto the -u form", () => {
    expect(obliqueCardinal(2)).toBe("dwóch");
    expect(obliqueCardinal(5)).toBe("pięciu");
    expect(obliqueCardinal(8)).toBe("ośmiu");
    expect(obliqueCardinal(12)).toBe("dwunastu");
    expect(obliqueCardinal(20)).toBe("dwudziestu");
    expect(obliqueCardinal(100)).toBe("stu");
    expect(obliqueCardinal(500)).toBe("pięciuset");
  });

  it("leaves a trailing jeden alone", () => {
    expect(obliqueCardinal(21)).toBe("dwudziestu jeden");
    expect(obliqueCardinal(123)).toBe("stu dwudziestu trzech");
  });
});

describe("government", () => {
  it("leaves the noun singular after jeden", () => {
    expect(government(1, "mInanim")).toBe("nomSg");
  });

  it("pluralises after 2, 3 and 4", () => {
    for (const n of [2, 3, 4, 22, 33, 104]) {
      expect(government(n, "mInanim")).toBe("nomPl");
      expect(government(n, "f")).toBe("nomPl");
    }
  });

  it("sends the teens to the genitive — the classic trap", () => {
    for (const n of [12, 13, 14, 112, 113, 114]) {
      expect(government(n, "f")).toBe("genPl");
    }
  });

  it("sends 5 and up, and anything ending in 1 past one, to the genitive", () => {
    expect(government(5, "n")).toBe("genPl");
    expect(government(21, "n")).toBe("genPl");
    expect(government(0, "n")).toBe("genPl");
    expect(government(100, "f")).toBe("genPl");
  });

  it("puts men in the genitive whatever the number", () => {
    for (const n of [2, 3, 4, 5, 22]) {
      expect(government(n, "mPers")).toBe("genPl");
    }
    expect(government(1, "mPers")).toBe("nomSg");
  });
});

describe("countingNumeral", () => {
  it("agrees jeden with the noun", () => {
    expect(countingNumeral(1, "mInanim")).toBe("jeden");
    expect(countingNumeral(1, "f")).toBe("jedna");
    expect(countingNumeral(1, "n")).toBe("jedno");
  });

  it("uses dwie in front of a feminine, even inside a compound", () => {
    expect(countingNumeral(2, "f")).toBe("dwie");
    expect(countingNumeral(2, "mInanim")).toBe("dwa");
    expect(countingNumeral(42, "f")).toBe("czterdzieści dwie");
    expect(countingNumeral(12, "f")).toBe("dwanaście");
  });

  it("switches to the -u form when counting men", () => {
    expect(countingNumeral(2, "mPers")).toBe("dwóch");
    expect(countingNumeral(5, "mPers")).toBe("pięciu");
    expect(countingNumeral(22, "mPers")).toBe("dwudziestu dwóch");
  });
});

describe("declineNumeral", () => {
  it("declines jeden like an adjective", () => {
    expect(declineNumeral(1, "mInanim", "acc")).toEqual(["jeden"]);
    expect(declineNumeral(1, "mAnim", "acc")).toEqual(["jednego"]);
    expect(declineNumeral(1, "n", "acc")).toEqual(["jedno"]);
    expect(declineNumeral(1, "f", "acc")).toEqual(["jedną"]);
    expect(declineNumeral(1, "f", "gen")).toEqual(["jednej"]);
    expect(declineNumeral(1, "mInanim", "loc")).toEqual(["jednym"]);
  });

  it("gives 2, 3 and 4 their own dative and instrumental", () => {
    expect(declineNumeral(2, "mInanim", "gen")).toEqual(["dwóch"]);
    expect(declineNumeral(2, "mInanim", "dat")).toEqual(["dwóm"]);
    expect(declineNumeral(2, "mInanim", "ins")).toEqual(["dwoma"]);
    expect(declineNumeral(2, "f", "ins")).toEqual(["dwiema", "dwoma"]);
    expect(declineNumeral(3, "n", "dat")).toEqual(["trzem"]);
    expect(declineNumeral(4, "n", "ins")).toEqual(["czterema"]);
  });

  it("gives 5 and up one oblique form, plus -oma in the instrumental", () => {
    expect(declineNumeral(5, "f", "gen")).toEqual(["pięciu"]);
    expect(declineNumeral(5, "f", "dat")).toEqual(["pięciu"]);
    expect(declineNumeral(5, "f", "loc")).toEqual(["pięciu"]);
    expect(declineNumeral(5, "f", "ins")).toEqual(["pięcioma", "pięciu"]);
    expect(declineNumeral(12, "n", "ins")).toEqual(["dwunastoma", "dwunastu"]);
  });

  it("keeps the counting form in the nominative and accusative", () => {
    expect(declineNumeral(5, "f", "nom")).toEqual(["pięć"]);
    expect(declineNumeral(5, "mPers", "acc")).toEqual(["pięciu"]);
    expect(declineNumeral(2, "f", "nom")).toEqual(["dwie"]);
  });

  it("leaves the hundreds out of the -oma ending", () => {
    expect(declineNumeral(500, "f", "ins")).toEqual(["pięciuset"]);
  });
});

describe("ordinal", () => {
  it("declines like an adjective, hard, soft and velar alike", () => {
    expect(ordinal(1, "mInanim", "sg", "nom")).toBe("pierwszy");
    expect(ordinal(2, "mInanim", "sg", "nom")).toBe("drugi");
    expect(ordinal(2, "f", "sg", "nom")).toBe("druga");
    expect(ordinal(2, "f", "sg", "gen")).toBe("drugiej");
    expect(ordinal(3, "mInanim", "sg", "nom")).toBe("trzeci");
    expect(ordinal(3, "f", "sg", "loc")).toBe("trzeciej");
    expect(ordinal(7, "f", "sg", "loc")).toBe("siódmej");
    expect(ordinal(12, "mInanim", "sg", "gen")).toBe("dwunastego");
  });

  it("declines both halves of a compound ordinal", () => {
    expect(ordinalLemma(21)).toBe("dwudziesty pierwszy");
    expect(ordinal(21, "mInanim", "sg", "gen")).toBe("dwudziestego pierwszego");
    expect(ordinal(31, "f", "sg", "loc")).toBe("trzydziestej pierwszej");
  });

  it("refuses what it has no word for", () => {
    expect(() => ordinal(101, "f", "sg", "nom")).toThrow();
  });
});

describe("english", () => {
  it("glosses cardinals", () => {
    expect(englishNumber(0)).toBe("zero");
    expect(englishNumber(47)).toBe("forty-seven");
    expect(englishNumber(258)).toBe("two hundred and fifty-eight");
    expect(englishNumber(1234)).toBe("one thousand two hundred and thirty-four");
  });

  it("glosses ordinals", () => {
    expect(englishOrdinal(1)).toBe("first");
    expect(englishOrdinal(12)).toBe("twelfth");
    expect(englishOrdinal(21)).toBe("twenty-first");
    expect(englishOrdinal(30)).toBe("thirtieth");
    expect(englishOrdinal(100)).toBe("hundredth");
  });
});
