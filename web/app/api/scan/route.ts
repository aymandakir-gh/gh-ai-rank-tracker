/**
 * POST /api/scan — Next.js 14 App Router API route
 *
 * Runs the AI Rank Tracker engine directly (no external Hono proxy).
 * Demo mode uses scripted MockProviders; non-demo uses MockProvider with
 * brand-specific fallback text so the tool works without live API keys.
 *
 * Rate limit: 1 request / IP / 10 minutes (in-memory, resets on cold start).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { TrackingConfig, EngineResponse, AnswerEngineProvider } from '@engine';
import { MockProvider, runTracking, demoConfig, demoProviders } from '@engine';
import { toWebScanResult } from '@/lib/mapper';
import type { ScanApiResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

// ─── In-memory rate limiter ───────────────────────────────────────────────────
const ipTimestamps = new Map<string, number[]>();
const RATE_WINDOW_MS = 10 * 60 * 1_000; // 10 minutes
const RATE_LIMIT = 1;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const prev = (ipTimestamps.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (prev.length >= RATE_LIMIT) return false; // blocked
  prev.push(now);
  ipTimestamps.set(ip, prev);
  return true; // allowed
}

/**
 * Resolve the client IP for rate-limiting from X-Forwarded-For. The header is
 * client-controllable on the left; a trusted proxy appends the real client on
 * the right — so read the right-most entry to resist the leftmost-spoof bypass.
 * Returns 'unknown' when the header is absent.
 */
function clientIp(req: NextRequest): string {
  const parts = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[parts.length - 1] ?? 'unknown';
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────
const BrandSchema = z.object({
  name: z.string().min(1).max(100),
  domain: z.string().max(200).optional(),
  aliases: z.array(z.string().max(100)).max(10).optional(),
});

const PromptSchema = z.object({
  text: z.string().min(1).max(500),
  weight: z.number().min(0.1).max(10).default(1),
});

const CompetitorSchema = z.object({
  name: z.string().min(1).max(100),
  domain: z.string().max(200).optional(),
});

const ScanRequestSchema = z.object({
  brand: BrandSchema,
  prompts: z.array(PromptSchema).min(1).max(20),
  competitors: z.array(CompetitorSchema).max(10).optional(),
  useDemo: z.boolean().optional().default(false),
});

// ─── Capture proxy — intercepts EngineResponse to retain raw citation URLs ───
function withCapture(
  inner: AnswerEngineProvider,
  store: Map<string, EngineResponse[]>,
): AnswerEngineProvider {
  return {
    engine: inner.engine,
    async query(prompt: string): Promise<EngineResponse> {
      const resp = await inner.query(prompt);
      const arr = store.get(prompt) ?? [];
      arr.push(resp);
      store.set(prompt, arr);
      return resp;
    },
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse<ScanApiResponse>> {
  // Rate limit by IP
  const ip = clientIp(req);
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Try again in 10 minutes.' },
      { status: 429 },
    );
  }

  // Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ScanRequestSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Validation failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  const { brand, prompts, competitors, useDemo } = parsed.data;

  // Build config + providers
  let config: TrackingConfig;
  let rawProviders: AnswerEngineProvider[];

  if (useDemo) {
    config = demoConfig;
    rawProviders = demoProviders();
  } else {
    config = {
      brand: { name: brand.name, domain: brand.domain, aliases: brand.aliases },
      competitors: competitors?.map((c) => ({ name: c.name, domain: c.domain })),
      prompts: prompts.map((p) => ({ prompt: p.text, weight: p.weight })),
    };
    const fallbackText = `${brand.name} is a notable player in this space.`;
    const fallbackCitations = brand.domain
      ? [{ url: `https://${brand.domain}`, title: brand.name }]
      : [];
    rawProviders = [
      new MockProvider({
        engine: 'mock',
        fallback: { text: fallbackText, citations: fallbackCitations },
      }),
    ];
  }

  // Wrap with capture proxy so the mapper can recover citation URLs
  const capturedByPrompt = new Map<string, EngineResponse[]>();
  const providers = rawProviders.map((p) => withCapture(p, capturedByPrompt));

  try {
    const report = await runTracking(config, providers);
    const result = toWebScanResult(report, capturedByPrompt);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tracking run failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
