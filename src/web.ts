/**
 * Web-safe subset of gh-ai-rank-tracker exports.
 *
 * Does NOT re-export the standalone Hono API server (src/api/scan.ts),
 * which carries a `hono` dependency that Next.js/webpack can't resolve
 * from the web/ subdirectory.
 *
 * Import from this module (via the @engine alias in web/tsconfig.json)
 * instead of the main index.ts.
 */
export * from "./types";
export * from "./detect";
export * from "./score";
export * from "./providers";
export * from "./tracker";
export { demoConfig, demoProviders } from "./demo";
