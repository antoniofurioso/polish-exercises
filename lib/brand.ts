/**
 * The product's name and pitch, in one place so the brand can change with a
 * one-file edit (plans/phase-3.md §1). PLACEHOLDER until the name is chosen
 * (research in plans/naming.md): every page title, the manifest, the landing
 * page and the privacy policy read from here.
 */
export const BRAND = {
  /** Product name as shown in titles and headings. */
  name: "Ćwiczenia",
  /** Short name for the home-screen icon (≤ 12 characters). */
  shortName: "Ćwiczenia",
  /** One line under the name. */
  tagline: "Polish grammar practice",
  /** Search-engine description of the whole site. */
  description:
    "Polish grammar drills with spaced repetition: the seven cases, pronouns, numbers and verb tenses, one sentence at a time, with the rule after every answer.",
  /** Full site URL without a trailing slash; empty until there is a domain. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "",
  /** The person responsible, for the privacy policy. */
  owner: "Antonio Furioso",
  /** Contact address for the privacy policy; empty until it exists. */
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
} as const;
