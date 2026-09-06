import { describe, expect, it } from "vitest";
import { ADJECTIVES } from "../adjectives";
import { declineAdjective } from "../declineAdjective";

const byLemma = (lemma: string) => ADJECTIVES.find((a) => a.lemma === lemma)!;

describe("declineAdjective", () => {
  it("declines a hard stem", () => {
    const dobry = byLemma("dobry");
    expect(declineAdjective(dobry, "mInanim", "sg", "nom")).toBe("dobry");
    expect(declineAdjective(dobry, "mPers", "sg", "gen")).toBe("dobrego");
    expect(declineAdjective(dobry, "mPers", "sg", "acc")).toBe("dobrego");
    expect(declineAdjective(dobry, "mInanim", "sg", "acc")).toBe("dobry");
    expect(declineAdjective(dobry, "mPers", "sg", "dat")).toBe("dobremu");
    expect(declineAdjective(dobry, "mPers", "sg", "ins")).toBe("dobrym");
    expect(declineAdjective(dobry, "f", "sg", "nom")).toBe("dobra");
    expect(declineAdjective(dobry, "f", "sg", "gen")).toBe("dobrej");
    expect(declineAdjective(dobry, "f", "sg", "acc")).toBe("dobrą");
    expect(declineAdjective(dobry, "n", "sg", "nom")).toBe("dobre");
    expect(declineAdjective(dobry, "mPers", "pl", "nom")).toBe("dobrzy");
    expect(declineAdjective(dobry, "f", "pl", "nom")).toBe("dobre");
    expect(declineAdjective(dobry, "mPers", "pl", "acc")).toBe("dobrych");
    expect(declineAdjective(dobry, "n", "pl", "acc")).toBe("dobre");
    expect(declineAdjective(dobry, "f", "pl", "gen")).toBe("dobrych");
    expect(declineAdjective(dobry, "f", "pl", "ins")).toBe("dobrymi");
    expect(declineAdjective(dobry, "f", "pl", "dat")).toBe("dobrym");
  });

  it("declines a velar stem", () => {
    const drogi = byLemma("drogi");
    expect(declineAdjective(drogi, "mInanim", "sg", "nom")).toBe("drogi");
    expect(declineAdjective(drogi, "f", "sg", "nom")).toBe("droga");
    expect(declineAdjective(drogi, "f", "sg", "acc")).toBe("drogą");
    expect(declineAdjective(drogi, "n", "sg", "nom")).toBe("drogie");
    expect(declineAdjective(drogi, "mInanim", "sg", "gen")).toBe("drogiego");
    expect(declineAdjective(drogi, "f", "sg", "gen")).toBe("drogiej");
    expect(declineAdjective(drogi, "mInanim", "sg", "ins")).toBe("drogim");
    expect(declineAdjective(drogi, "f", "pl", "gen")).toBe("drogich");
    expect(declineAdjective(drogi, "f", "pl", "ins")).toBe("drogimi");
    expect(declineAdjective(drogi, "mPers", "pl", "nom")).toBe("drodzy");
  });

  it("declines a soft stem", () => {
    const tani = byLemma("tani");
    expect(declineAdjective(tani, "mInanim", "sg", "nom")).toBe("tani");
    expect(declineAdjective(tani, "f", "sg", "nom")).toBe("tania");
    expect(declineAdjective(tani, "f", "sg", "acc")).toBe("tanią");
    expect(declineAdjective(tani, "f", "sg", "gen")).toBe("taniej");
    expect(declineAdjective(tani, "n", "sg", "nom")).toBe("tanie");
    expect(declineAdjective(tani, "mInanim", "sg", "gen")).toBe("taniego");
    expect(declineAdjective(tani, "mInanim", "sg", "loc")).toBe("tanim");
    expect(declineAdjective(tani, "n", "pl", "gen")).toBe("tanich");
    expect(declineAdjective(tani, "n", "pl", "ins")).toBe("tanimi");
  });

  it("uses the nominative form in the vocative", () => {
    const mily = byLemma("miły");
    expect(declineAdjective(mily, "mPers", "sg", "voc")).toBe("miły");
    expect(declineAdjective(mily, "f", "sg", "voc")).toBe("miła");
    expect(declineAdjective(mily, "mPers", "pl", "voc")).toBe("mili");
  });

  it("keeps every lexicon entry consistent with its lemma", () => {
    for (const adj of ADJECTIVES) {
      expect(declineAdjective(adj, "mInanim", "sg", "nom")).toBe(adj.lemma);
    }
  });
});
