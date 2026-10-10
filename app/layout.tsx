import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { Analytics } from "@/components/Analytics";
import { ServiceWorker } from "@/components/ServiceWorker";
import { BRAND } from "@/lib/brand";
import { THEME_KEY } from "@/lib/theme";
import "./globals.css";

/** Inter for the interface, a serif for Polish sentences (DESIGN.md). Both carry the Polish letters. */
const inter = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext"] });
const serif = Source_Serif_4({
  variable: "--font-serif-pl",
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: { default: `${BRAND.name} — ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
};

/** Browser and installed-app chrome follows the page background (--background in globals.css). */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121214" },
  ],
};

/**
 * Applies a light or dark choice from Settings before the first paint, so the
 * page never flashes the other theme. "System" leaves it to the CSS media query.
 */
const THEME_SCRIPT = `try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_KEY)}));if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/**
 * Every page. The marketing pages add the header and footer in app/(site)/layout.tsx,
 * the app pages the sidebar in app/(app)/layout.tsx; /today and /practice run bare.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        <ServiceWorker />
        <Analytics />
      </body>
    </html>
  );
}
