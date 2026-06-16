/**
 * gh-ai-rank-tracker — API server entry point.
 *
 * Dev:  NODE_ENV=development tsx src/server.ts
 * Prod: node dist/src/server.js
 *
 * Environment variables:
 *   PORT               TCP port to listen on (default: 3000)
 *   SCAN_API_KEY       Bearer token for API auth — REQUIRED in production.
 *                      Omit only for local development (NODE_ENV=development).
 *   PERPLEXITY_API_KEY Required when using provider=perplexity
 *   NODE_ENV           Set to "development" to skip SCAN_API_KEY guard
 */
import { serve } from "@hono/node-server";
import { createApp } from "./api/scan";
import { openStore } from "./store";

const PORT = Number(process.env["PORT"] ?? 3000);
const SCAN_API_KEY = process.env["SCAN_API_KEY"] ?? "";
const IS_DEV = process.env["NODE_ENV"] === "development";

// ─── Production startup guard ────────────────────────────────────────────────
// Fail fast if SCAN_API_KEY is not set outside of development.
// Prevents the API from starting unauthenticated in production.
if (!SCAN_API_KEY && !IS_DEV) {
  console.error(
    "[gh-ai-rank-tracker] FATAL: SCAN_API_KEY environment variable is not set.\n" +
      "  Set SCAN_API_KEY=<secret> in your Railway environment variables.\n" +
      "  To run locally without auth, set NODE_ENV=development.",
  );
  process.exit(1);
}

// Local-first campaign persistence (JSON file; path via TRACKER_STORE_PATH).
const app = createApp({ store: openStore() });

const authMode = SCAN_API_KEY
  ? "bearer-auth"
  : "OPEN ⚠️  (NODE_ENV=development — not safe for production)";

console.log(
  `[gh-ai-rank-tracker] Starting API server on port ${PORT} — auth: ${authMode}`,
);

serve({ fetch: app.fetch, port: PORT });

console.log(`[gh-ai-rank-tracker] Ready.`);
console.log(`  POST http://localhost:${PORT}/api/scan`);
console.log(`  POST http://localhost:${PORT}/api/campaign      (run + persist a campaign)`);
console.log(`  GET  http://localhost:${PORT}/api/campaign/:id   (history + trend)`);
console.log(`  GET  http://localhost:${PORT}/health`);
console.log(`[gh-ai-rank-tracker] Example:`);
console.log(
  `  curl -X POST http://localhost:${PORT}/api/scan \\`,
);
console.log(`    -H 'Content-Type: application/json' \\`);
console.log(
  `    -d '{"url":"https://growthackers.io","providers":["mock"]}'`,
);
