import type { Case } from "./types";

export const CASE_INFO: Record<
  Case,
  { pl: string; en: string; question: string }
> = {
  nom: { pl: "Mianownik", en: "Nominative", question: "kto? co?" },
  gen: { pl: "Dopełniacz", en: "Genitive", question: "kogo? czego?" },
  dat: { pl: "Celownik", en: "Dative", question: "komu? czemu?" },
  acc: { pl: "Biernik", en: "Accusative", question: "kogo? co?" },
  ins: { pl: "Narzędnik", en: "Instrumental", question: "kim? czym?" },
  loc: { pl: "Miejscownik", en: "Locative", question: "o kim? o czym?" },
  voc: { pl: "Wołacz", en: "Vocative", question: "o!" },
};
