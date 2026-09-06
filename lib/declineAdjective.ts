import type { Adjective, Case, Gender, GramNumber } from "./types";

/**
 * Adjective endings are fully regular once you know the stem hardness.
 * Soft stems insert -i- before every ending (tan + ia = tania);
 * velar stems (k, g) insert it before everything except -a and -ą
 * (drog + a = droga, but drog + iego = drogiego).
 */
function join(adj: Adjective, ending: string): string {
  if (adj.type === "hard") return adj.stem + ending;
  if (adj.type === "soft") return adj.stem + "i" + ending;
  return /^[aą]/.test(ending) ? adj.stem + ending : adj.stem + "i" + ending;
}

/** Endings whose hard variant starts with -y-: -y, -ym, -ych, -ymi. */
function yEnding(adj: Adjective, rest: string): string {
  return adj.type === "hard" ? adj.stem + "y" + rest : join(adj, rest);
}

const VIRILE: Gender[] = ["mPers"];

export function declineAdjective(
  adj: Adjective,
  gender: Gender,
  number: GramNumber,
  kase: Case,
): string {
  if (number === "pl") {
    const virile = VIRILE.includes(gender);
    switch (kase) {
      case "nom":
      case "voc":
        return virile ? adj.virilePl : join(adj, "e");
      case "acc":
        return virile ? yEnding(adj, "ch") : join(adj, "e");
      case "gen":
      case "loc":
        return yEnding(adj, "ch");
      case "dat":
        return yEnding(adj, "m");
      case "ins":
        return yEnding(adj, "mi");
    }
  }

  if (gender === "f") {
    switch (kase) {
      case "nom":
      case "voc":
        return join(adj, "a");
      case "gen":
      case "dat":
      case "loc":
        return join(adj, "ej");
      case "acc":
      case "ins":
        return join(adj, "ą");
    }
  }

  if (gender === "n") {
    switch (kase) {
      case "nom":
      case "acc":
      case "voc":
        return join(adj, "e");
      case "gen":
        return join(adj, "ego");
      case "dat":
        return join(adj, "emu");
      case "ins":
      case "loc":
        return yEnding(adj, "m");
    }
  }

  // masculine singular
  switch (kase) {
    case "nom":
    case "voc":
      return yEnding(adj, "");
    case "gen":
      return join(adj, "ego");
    case "dat":
      return join(adj, "emu");
    case "acc":
      return gender === "mInanim" ? yEnding(adj, "") : join(adj, "ego");
    case "ins":
    case "loc":
      return yEnding(adj, "m");
  }
}
