import { LEXICON } from "./lexicon";
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
 *
 * "@name" in a template stands for a list in data/groups.json, or for
 * "@relatives", derived from the nouns tagged "family" (see loadLexicon).
 */

/** The sentence templates, in data/templates.json; see data/README.md for the layout. */
export const TEMPLATES: Template[] = LEXICON.templates;
