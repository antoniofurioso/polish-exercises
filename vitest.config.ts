import { defineConfig } from "vitest/config";

/**
 * Two runs over the same code, split by which lexicon lib/lexicon.ts exports:
 *
 *   published  what a learner sees, drafts left out. Every test runs here,
 *              the golden snapshot included, so a draft can never change it.
 *   drafts     NEXT_PUBLIC_INCLUDE_DRAFTS=1: the content gate (and the draft
 *              filter's own test) over everything in data/, drafts included,
 *              so a bad draft fails `npm test` before anyone reviews it.
 */
const DRAFT_TESTS = ["lib/__tests__/content.test.ts", "lib/__tests__/drafts.test.ts", "lib/__tests__/frames.test.ts"];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "published",
          include: ["lib/__tests__/**/*.test.ts", "scripts/**/*.test.ts"],
          env: { NEXT_PUBLIC_INCLUDE_DRAFTS: "" },
        },
      },
      {
        test: {
          name: "drafts",
          include: DRAFT_TESTS,
          env: { NEXT_PUBLIC_INCLUDE_DRAFTS: "1" },
        },
      },
    ],
  },
});
