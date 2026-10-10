import { Crosshair, Hash, KeyRound, Layers, Shuffle, Zap, type LucideIcon } from "lucide-react";
import type { ExerciseKind } from "@/lib/types";

/** One Lucide icon per drill, used in every drill list (DESIGN.md, Icons). */
export const DRILL_ICONS: Record<ExerciseKind, LucideIcon> = {
  cases: Layers,
  pronouns: Crosshair,
  possessives: KeyRound,
  numbers: Hash,
  verbs: Zap,
  shuffle: Shuffle,
};

export function DrillIcon({ kind, size = 22 }: { kind: ExerciseKind; size?: number }) {
  const Icon = DRILL_ICONS[kind];
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" />;
}
