/**
 * gh-ai-rank-tracker — API server entry point.
 *
 * Dev:  tsx src/server.ts
 * Prod: node dist/src/server.js
 *
 * Environment variables:
 *   PORT            TCP port to listen on (default: 3000)
 *   SCAN_API_KEY    Bearer token for auth (leave unset to run open / dev mode)
 *   PERPLEXITY_API_KEY  Required when using provider=perplexity
 */
import { serve } from "@hono/node-server";
import { createApp } from "./api/scan";

const PORT = Number(process.env["PORT"] ?? 3000);
const app = createApp();

const authMode = process.env["SCAN_API_KEY"] ? "bearer-auth" : "OPEN (dev mode)";
console.log(`[gh-ai-rank-tracker] Starting API server on port ${PORT} — auth: ${authMode}`);

serve({ fetch: app.fetch, port: PORT });

console.log(`[gh-ai-rank-tracker] Ready. POST http://localhost:${PORT}/api/scan`);
console.log(`[gh-ai-rank-tracker] Example:`);
console.log(
  `  curl -X POST http://localhost:${PORT}/api/scan \\`,
);
console.log(`    -H 'Content-Type: application/json' \\`);
console.log(`    -d '{"url":"https://growthackers.io","providers":["mock"]}'`);
