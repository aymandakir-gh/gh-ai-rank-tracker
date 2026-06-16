import { defineConfig } from "vitest/config";

// Root project: the TypeScript engine + Hono API (src/**).
// React/Next.js web tests live under web/ and run via `cd web && npm test`.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
