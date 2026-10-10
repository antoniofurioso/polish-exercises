/**
 * The product's name and pitch, in one place so the brand can change with a
 * one-file edit (plans/phase-3.md §1): every page title, the corner wordmark,
 * the manifest, the landing page and the privacy policy read from here.
 * After a change, run `npm run icons` (the placeholder icon is its first letter).
 */
export const BRAND = {
  /** Product name as shown in titles and headings. */
  name: "PolishUp",
  /** Short name for the home-screen icon (≤ 12 characters). */
  shortName: "PolishUp",
  /** One line under the name. */
  tagline: "Polish grammar practice",
  /** Search-engine description of the whole site. */
  description:
    "Polish grammar drills with spaced repetition: the seven cases, pronouns, numbers and verb tenses, one sentence at a time, with the rule after every answer.",
  /**
   * Full site URL without a trailing slash: canonical links, Open Graph and the
   * sitemap point here, so preview deployments name the production address too.
   */
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://polishup.app",
  /** The person responsible, for the privacy policy. */
  owner: "Antonio Furioso",
  /** Contact address for the privacy policy; empty until it exists. */
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
} as const;
