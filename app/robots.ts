import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

// a metadata route is a route handler: a static export needs it prerendered
export const dynamic = "force-static";

/**
 * out/robots.txt: everything may be crawled. The runner pages (/practice,
 * /today) carry a noindex meta tag instead of a Disallow, which would hide
 * that tag from crawlers. The sitemap line only appears once there is a domain.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    ...(BRAND.url ? { sitemap: `${BRAND.url}/sitemap.xml` } : {}),
  };
}
