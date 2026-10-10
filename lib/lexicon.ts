import adjectives from "../data/adjectives.json";
import agreement from "../data/agreement-frames.json";
import collocations from "../data/collocations.json";
import counting from "../data/count-frames.json";
import groups from "../data/groups.json";
import nouns from "../data/nouns.json";
import numerals from "../data/numeral-frames.json";
import templates from "../data/templates.json";
import verbs from "../data/verbs.json";
import { loadLexicon, publish } from "./load";
import type { Lexicon } from "./load";

/**
 * Every file in data/, loaded once. Entries marked `"review": "draft"` are
 * only in the lexicon the drills use when NEXT_PUBLIC_INCLUDE_DRAFTS=1, i.e.
 * `npm run dev:drafts`, a preview build made with it set, or the drafts
 * project in vitest.config.ts. Next.js inlines the variable at build time.
 */
export const INCLUDE_DRAFTS = process.env.NEXT_PUBLIC_INCLUDE_DRAFTS === "1";

/** Everything in data/, drafts included: what the review tools work on. */
export const FULL_LEXICON: Lexicon = loadLexicon({
  nouns,
  adjectives,
  collocations,
  groups,
  templates,
  verbs,
  agreement,
  counting,
  numerals,
});

/** The lexicon the drills draw from. */
export const LEXICON: Lexicon = INCLUDE_DRAFTS ? FULL_LEXICON : publish(FULL_LEXICON);
