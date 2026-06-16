/**
 * OBS-2 Analytics — unit tests
 *
 * Verifies that:
 *  1. PostHog key events are declared in source (grep-based)
 *  2. Sentry config files exist and contain graceful-degrade guard
 *  3. PostHog provider uses memory persistence (no localStorage)
 *  4. .env.example exposes the required OBS env vars
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '..');

function readSrc(rel: string) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

// ── Key event names required by OBS spec ─────────────────────────────────────

const REQUIRED_EVENTS = [
  'pageview',        // PostHog capture_pageview: true in PostHogProvider
  'score_completed', // results/page.tsx — user sees their score
  'lead_captured',   // results/page.tsx — email gate submitted
  'demo_used',       // app/page.tsx    — demo scan completed
] as const;

describe('OBS-2 key events', () => {
  it('pageview is captured automatically (capture_pageview: true)', () => {
    const provider = readSrc('components/PostHogProvider.tsx');
    expect(provider).toContain('capture_pageview: true');
  });

  it('score_completed fires in results page', () => {
    const results = readSrc('app/results/page.tsx');
    expect(results).toContain("posthog.capture('score_completed'");
  });

  it('lead_captured fires in results page on email submit', () => {
    const results = readSrc('app/results/page.tsx');
    expect(results).toContain("posthog.capture('lead_captured'");
    expect(results).toContain("source: 'ai-rank-tracker'");
  });

  it('demo_used fires in home page on demo scan complete', () => {
    const page = readSrc('app/page.tsx');
    expect(page).toContain("posthog.capture('demo_used'");
    expect(page).toContain('if (useDemo)');
  });
});

// ── Graceful degrade ──────────────────────────────────────────────────────────

describe('OBS-2 graceful degrade', () => {
  it('PostHogProvider is a no-op when NEXT_PUBLIC_POSTHOG_KEY is absent', () => {
    const provider = readSrc('components/PostHogProvider.tsx');
    expect(provider).toContain("if (!key) return");
  });

  it('PostHogProvider uses memory persistence (no localStorage)', () => {
    const provider = readSrc('components/PostHogProvider.tsx');
    expect(provider).toContain("persistence: 'memory'");
  });

  it('Sentry client config only inits when DSN is set', () => {
    const client = readSrc('sentry.client.config.ts');
    expect(client).toContain('if (dsn)');
  });

  it('Sentry server config only inits when DSN is set', () => {
    const server = readSrc('sentry.server.config.ts');
    expect(server).toContain('if (dsn)');
  });

  it('Sentry edge config only inits when DSN is set', () => {
    const edge = readSrc('sentry.edge.config.ts');
    expect(edge).toContain('if (dsn)');
  });
});

// ── .env.example completeness ─────────────────────────────────────────────────

describe('OBS-2 env.example completeness', () => {
  const envExample = readSrc('.env.example');

  it('exposes NEXT_PUBLIC_SENTRY_DSN', () => {
    expect(envExample).toContain('NEXT_PUBLIC_SENTRY_DSN');
  });

  it('exposes NEXT_PUBLIC_POSTHOG_KEY', () => {
    expect(envExample).toContain('NEXT_PUBLIC_POSTHOG_KEY');
  });

  it('exposes NEXT_PUBLIC_POSTHOG_HOST', () => {
    expect(envExample).toContain('NEXT_PUBLIC_POSTHOG_HOST');
  });
});

// ── next.config.mjs wraps with withSentryConfig ───────────────────────────────
// Next.js loads next.config.mjs (not .ts); the Sentry wrapper + source-map guard
// live there. See issue #5 / the v0.4.0 release review.

describe('OBS-2 next.config.mjs', () => {
  it('uses withSentryConfig wrapper', () => {
    const nextConf = readSrc('next.config.mjs');
    expect(nextConf).toContain('withSentryConfig');
  });

  it('disables source maps when SENTRY_AUTH_TOKEN is absent', () => {
    const nextConf = readSrc('next.config.mjs');
    expect(nextConf).toContain('SENTRY_AUTH_TOKEN');
  });
});
