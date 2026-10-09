import Link from "next/link";
import { BRAND } from "@/lib/brand";

/** The top bar of the landing, /learn and the reference pages: the name, then the app's way in. */
export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-5">
      <Link href="/" className="text-sm font-medium uppercase tracking-[0.2em] text-accent">
        {BRAND.name}
      </Link>
      <nav aria-label="Main" className="flex items-center gap-5 text-sm">
        <Link href="/learn" className="text-muted hover:text-accent">
          Drills
        </Link>
        <Link href="/progress" className="text-muted hover:text-accent">
          Progress
        </Link>
        <Link
          href="/today"
          className="rounded-lg bg-accent px-3 py-1.5 font-medium text-white transition-opacity hover:opacity-90"
        >
          Practise
        </Link>
      </nav>
    </header>
  );
}
