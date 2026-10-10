"use client";

import type { ReactNode } from "react";

/** A selectable card in the drill configurators: one option of a group, aria-pressed when chosen. */
export function Choice({
  selected,
  onClick,
  children,
  className = "",
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-12 cursor-pointer rounded-xl border px-4 py-3 text-left transition-colors ${
        selected
          ? "border-accent bg-accent-soft text-foreground shadow-[inset_0_0_0_1px_var(--accent)]"
          : "border-line-strong bg-surface text-foreground hover:border-accent"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** One numbered step of a configurator: a caption, a hint and its choices. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="label-caps text-accent">{label}</h2>
        {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}
