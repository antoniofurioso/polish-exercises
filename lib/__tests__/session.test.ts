import { describe, expect, it } from "vitest";
import { parseSession, sessionParams } from "../session";
import type { Config } from "../types";

const config: Config = { cases: ["gen", "loc"], numbers: ["sg", "pl"], mode: "both", count: 30 };

describe("session URLs", () => {
  it("round-trips a config through the query string", () => {
    const parsed = parseSession(new URLSearchParams(sessionParams(config, 42)));
    expect(parsed).toEqual({ config, seed: 42 });
  });

  it("round-trips a gender subset", () => {
    const withGenders: Config = { ...config, genders: ["f", "n"] };
    const parsed = parseSession(new URLSearchParams(sessionParams(withGenders, 1)));
    expect(parsed).toEqual({ config: withGenders, seed: 1 });
  });

  it("drops the gender filter when all groups are selected", () => {
    const parsed = parseSession(
      new URLSearchParams(sessionParams({ ...config, genders: ["m", "f", "n"] }, 1)),
    );
    expect(parsed?.config.genders).toBeUndefined();
  });

  it("rejects a link with no valid case", () => {
    expect(parseSession(new URLSearchParams("count=10"))).toBeNull();
    expect(parseSession(new URLSearchParams("cases=xx&count=10"))).toBeNull();
  });

  it("falls back on junk values", () => {
    const parsed = parseSession(new URLSearchParams("cases=gen&num=zz&mode=zz&count=9999"));
    expect(parsed?.config).toEqual({ cases: ["gen"], numbers: ["sg"], mode: "nouns", count: 200 });
    expect(parsed?.seed).toBe(1);
  });
});
