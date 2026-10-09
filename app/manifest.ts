import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

// written to out/manifest.webmanifest at build time (static export)
export const dynamic = "force-static";

/** A colour token from the light theme in app/globals.css, so the manifest follows the palette. */
function cssToken(name: string): string {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
  const root = /:root\s*{([^}]*)}/.exec(css)?.[1] ?? "";
  const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(root)?.[1]?.trim();
  if (!value) throw new Error(`app/globals.css: no --${name} in the first :root block`);
  return value;
}

/** The web app manifest (plans/phase-3.md §2). Icons come from `npm run icons`. */
export default function manifest(): MetadataRoute.Manifest {
  const background = cssToken("background");
  return {
    id: "/today",
    name: BRAND.name,
    short_name: BRAND.shortName,
    description: BRAND.description,
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: background,
    theme_color: background,
    lang: "en",
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
