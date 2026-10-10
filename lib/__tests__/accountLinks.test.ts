import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { safeNext } from "../site";

describe("safeNext", () => {
  it("keeps same-origin paths with query and hash", () => {
    expect(safeNext("/today")).toBe("/today");
    expect(safeNext("/practice?type=verbs&seed=4#x")).toBe("/practice?type=verbs&seed=4#x");
  });

  it("falls back on anything that could leave the site", () => {
    for (const bad of [
      null,
      "",
      "today",
      "https://evil.example/",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "javascript:alert(1)",
    ]) {
      expect(safeNext(bad, "/learn")).toBe("/learn");
    }
  });
});

describe("marketing consent text", () => {
  it("the sign-in page shows CONSENT_TEXT_V1 word for word", () => {
    const contract = readFileSync("workers/api/src/contract.ts", "utf8");
    const page = readFileSync("app/(site)/signin/SignInClient.tsx", "utf8");
    const v1 = /CONSENT_TEXT_V1 =\s*"([^"]+)"/.exec(contract)?.[1];
    expect(v1).toBeTruthy();
    expect(page).toContain(`"${v1}"`);
  });
});
