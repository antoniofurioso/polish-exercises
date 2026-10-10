import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // fully static build (out/) — nothing in this app needs a server
  output: "export",
  env: {
    // Drafts in the lexicon or not (lib/lexicon.ts). Pinned here so the value is
    // inlined into the bundle even when it is unset: a published build is "".
    NEXT_PUBLIC_INCLUDE_DRAFTS: process.env.NEXT_PUBLIC_INCLUDE_DRAFTS === "1" ? "1" : "",
  },
};

export default nextConfig;
