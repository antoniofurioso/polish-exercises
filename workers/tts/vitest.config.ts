import { defineConfig } from "vitest/config";

// Plain Node: R2, the edge cache, the rate limiter and fetch are all mocked.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
