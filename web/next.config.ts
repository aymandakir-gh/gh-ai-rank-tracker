import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

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
const nextConfig: NextConfig = {}

export default withSentryConfig(nextConfig, {
  // Silence Sentry CLI output in CI / build logs
  silent: true,
  // Skip source-map uploads when SENTRY_AUTH_TOKEN is absent (OSS forks / local dev)
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  disableLogger: true,
})
