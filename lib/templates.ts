import groupData from "../data/groups.json";
import templateData from "../data/templates.json";
import { loadGroups, loadTemplates } from "./load";
import type { Groups } from "./load";
import { NOUNS } from "./nouns";
import type { Template } from "./types";

/**
 * {NP} is the noun-phrase slot in the Polish sentence — never put it first,
 * so sentence capitalisation stays fixed.
 * {z} and {w} are prepositions that grow an -e before consonant clusters
 * (z psem, but ze starym psem); resolvePrep in generate.ts handles them.
 * English uses {np} (a/an/some), {npDef} (the) or {npBare} (no article).
 *
 * Every sentence names the nouns it suits (requires / lemmas); only the
 * "to jest" frames are open to anything. A sentence a Pole would never say
 * ("Gdzie jest noc?", "Kocham chorego psa") is worse than no sentence.
 */

/**
 * What "@name" in a template stands for: the lists in data/groups.json, plus
 * those derived from the lexicon itself.
 */
const GROUPS: Groups = {
  ...loadGroups(groupData),
  /** Relatives need a possessive in English: "This is a husband" is no sentence. */
  relatives: NOUNS.filter((n) => n.tags.includes("family")).map((n) => n.lemma),
};

/** The sentence templates, in data/templates.json; see data/README.md for the layout. */
export const TEMPLATES: Template[] = loadTemplates(templateData, GROUPS);
