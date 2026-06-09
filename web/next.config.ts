import type { NextConfig } from 'next'

/**
 * gh-ai-rank-tracker web UI (Next.js 14 App Router)
 *
 * Architecture: this web app proxies POST /api/scan to the Hono backend
 * server (SCAN_API_URL env var, default http://localhost:3000).
 *
 * Dev workflow:
 *   1. repo root: npm run api:dev   (Hono on :3000)
 *   2. web/:      npm run dev       (Next.js on :3001)
 */
const config: NextConfig = {}

export default config
