import Link from "next/link";
import { BRAND } from "@/lib/brand";

/** The flag mark: a rounded square, white over red. Colours are the flag's, in both themes. */
export function FlagMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
      <rect x="1" y="1" width="26" height="26" rx="8" fill="#ffffff" stroke="#e2e2e7" />
      <path d="M1 14h26v5a8 8 0 0 1-8 8H9a8 8 0 0 1-8-8z" fill="#dc143c" />
    </svg>
  );
}

/** The mark and the name, linking home. */
export function Logo({ href = "/", size = 28 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 text-foreground no-underline">
      <FlagMark size={size} />
      <span className="text-lg font-bold tracking-tight">{BRAND.name}</span>
    </Link>
  );
}
