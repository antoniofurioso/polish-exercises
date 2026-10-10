import { defineConfig } from "vitest/config";

// Plain Node: D1 is node:sqlite running the real migrations (test/d1.ts);
// the rate limiters, Resend and Stripe (fetch) are mocked.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
