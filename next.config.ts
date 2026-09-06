import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // fully static build (out/) — nothing in this app needs a server
  output: "export",
};

export default nextConfig;
