import type { Metadata } from "next";
import { BRAND } from "./brand";

/**
 * The site's public pages (plans/phase-3.md §3): the reference pages written
 * for search, and the helper that gives every indexable page its metadata.
 * The sitemap, the footer and the landing page all read these lists.
 */

export type TopicPage = {
  path: string;
  /** Short name for links: "Polish cases". */
  name: string;
  /** One line under the link. */
  blurb: string;
};

export const TOPIC_PAGES: TopicPage[] = [
  {
    path: "/polish-cases",
    name: "Polish cases",
    blurb: "What each of the seven cases does, what triggers it, and the endings.",
  },
  {
    path: "/polish-pronouns",
    name: "Polish pronouns",
    blurb: "This and that, my and our: how they agree with the noun.",
  },
  {
    path: "/polish-numbers",
    name: "Polish numbers",
    blurb: "Why the noun changes after 2–4 and 5+, plus ordinals, dates and the time.",
  },
  {
    path: "/polish-verbs",
    name: "Polish verbs",
    blurb: "Aspect, the past, both futures and the imperative.",
  },
];

/** Every page the sitemap lists, most important first. */
export const INDEXED_PATHS: string[] = ["/", ...TOPIC_PAGES.map((p) => p.path), "/learn", "/privacy"];

/** The absolute URL of a path, or "" while the site has no domain (`BRAND.url` empty). */
export function absoluteUrl(path: string): string {
  if (!BRAND.url) return "";
  return path === "/" ? `${BRAND.url}/` : `${BRAND.url}${path}`;
}

/**
 * Title, description, Open Graph and (once there is a domain) the canonical
 * URL of an indexable page. `title` goes through the layout's template
 * ("… · name") unless `absolute` is set.
 */
export function pageMetadata({
  title,
  description,
  path,
  absolute = false,
}: {
  title: string;
  description: string;
  path: string;
  absolute?: boolean;
}): Metadata {
  const url = absoluteUrl(path);
  const fullTitle = absolute ? title : `${title} · ${BRAND.name}`;
  return {
    title: absolute ? { absolute: title } : title,
    description,
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: {
      title: fullTitle,
      description,
      siteName: BRAND.name,
      type: "website",
      locale: "en_GB",
      ...(url ? { url } : {}),
    },
  };
}

/** For the runner pages: a session URL or today's plan is nothing to index. */
export const NOINDEX: Metadata["robots"] = { index: false, follow: true };
