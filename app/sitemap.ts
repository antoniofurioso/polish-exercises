import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";
import { INDEXED_PATHS, absoluteUrl } from "@/lib/site";

// a metadata route is a route handler: a static export needs it prerendered
export const dynamic = "force-static";

/**
 * out/sitemap.xml. A sitemap needs absolute URLs, so until the site has a
 * domain (`NEXT_PUBLIC_SITE_URL`, read into `BRAND.url`) it is an empty
 * <urlset> and robots.txt does not point at it.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!BRAND.url) return [];
  return INDEXED_PATHS.map((path) => ({
    url: absoluteUrl(path),
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : path.startsWith("/polish-") ? 0.8 : 0.5,
  }));
}
