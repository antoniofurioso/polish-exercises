"use client";

import type { ReactNode } from "react";

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
      className={`rounded-xl border px-4 py-3 text-left transition-colors cursor-pointer ${
        selected
          ? "border-accent bg-accent-soft text-foreground"
          : "border-line bg-surface text-foreground hover:border-accent/50"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{label}</h2>
        {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}
