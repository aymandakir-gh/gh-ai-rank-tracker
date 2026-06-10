import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // include both backend .ts and React .tsx test files
    include: ["tests/**/*.test.{ts,tsx}"],
    // jsdom for React component tests; node (default) for everything else
    environmentMatchGlobs: [["tests/web/**", "jsdom"]],
    setupFiles: ["tests/web/setup.ts"],
  },
});
