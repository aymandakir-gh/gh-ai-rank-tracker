/**
 * POST /api/campaign — Next.js App Router route (engine-backed, self-contained).
 *
 * Runs a campaign (prompt set × engines) through the AI Rank Tracker engine and
 * returns a dashboard payload: a share-of-voice trend, per-engine breakdown,
 * competitor comparison and per-prompt drill-down.
 *
 *  - Demo mode (`useDemo: true`) replays the deterministic 4-week demo history
 *    (a real, engine-scored rising trend) so the dashboard has meaningful
 *    over-time data with no API keys and no persistence.
 *  - Custom mode runs the supplied campaign once with the offline MockProvider,
 *    yielding a single trend point. Persisted history over time is provided by
 *    the CLI / Hono API store (see README); this route stays stateless so it
 *    runs anywhere, including read-only/serverless hosts.
 *
 * Rate limit: 10 requests / IP / 10 minutes (in-memory, resets on cold start).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  runCampaign,
  computeTrend,
  demoCampaign,
  demoProvidersForWeek,
  MockProvider,
  type AnswerEngineProvider,
  type EngineResponse,
  type Campaign,
  type CampaignRun,
} from '@engine';
import { toWebCampaignResult } from '@/lib/campaign-mapper';
import type { CampaignApiResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

// ─── In-memory rate limiter ───────────────────────────────────────────────────
const ipTimestamps = new Map<string, number[]>();
const RATE_WINDOW_MS = 10 * 60 * 1_000;
const RATE_LIMIT = 10;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const prev = (ipTimestamps.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (prev.length >= RATE_LIMIT) return false;
  prev.push(now);
  ipTimestamps.set(ip, prev);
  return true;
}

/**
 * Resolve the client IP for rate-limiting from X-Forwarded-For. The header is
 * client-controllable on the left; a trusted proxy appends the real client on
 * the right — so we read the right-most entry, which resists the leftmost-spoof
 * bypass. Best-effort: this in-memory limiter assumes a single trusted proxy
 * (e.g. Railway) sets X-Forwarded-For and resets on cold start.
 */
function clientIp(req: NextRequest): string {
  const parts = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[parts.length - 1] ?? 'unknown';
}

// ─── Zod schema (custom campaigns) ──────────────────────────────────────────────
const CampaignSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  brand: z.object({
    name: z.string().min(1).max(100),
    domain: z.string().max(200).optional(),
    aliases: z.array(z.string().max(100)).max(10).optional(),
  }),
  competitors: z
    .array(z.object({ name: z.string().min(1).max(100), domain: z.string().max(200).optional() }))
    .max(10)
    .optional(),
  prompts: z
    .array(z.object({ text: z.string().min(1).max(500), weight: z.number().min(0.1).max(10).default(1) }))
    .min(1)
    .max(20),
});

const RequestSchema = z.union([
  z.object({ useDemo: z.literal(true) }),
  z.object({ useDemo: z.literal(false).optional(), campaign: CampaignSchema }),
]);

// ─── Capture proxy — retains raw citation URLs for the drill-down ───────────────
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

/**
 * Replay the deterministic 4-week demo history with capture, so the latest run
 * carries citation URLs for the drill-down. Dates/ids mirror demoCampaignHistory.
 */
async function buildDemoHistory(): Promise<{
  history: CampaignRun[];
  latestCapture: Map<string, EngineResponse[]>;
}> {
  const history: CampaignRun[] = [];
  let latestCapture = new Map<string, EngineResponse[]>();
  for (let w = 0; w < 4; w++) {
    const date = new Date(Date.UTC(2026, 4, 4 + w * 7, 9, 0, 0));
    const capture = new Map<string, EngineResponse[]>();
    const providers = demoProvidersForWeek(w).map((p) => withCapture(p, capture));
    const run = await runCampaign(demoCampaign, providers, {
      now: () => date,
      idFactory: () => `demo_run_${w + 1}`,
    });
    history.push(run);
    latestCapture = capture;
  }
  return { history, latestCapture };
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse<CampaignApiResponse>> {
  const ip = clientIp(req);
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Try again in a few minutes.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Validation failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  try {
    // ── Demo: deterministic multi-week trend ────────────────────────────────
    if ('useDemo' in parsed.data && parsed.data.useDemo === true) {
      const { history, latestCapture } = await buildDemoHistory();
      const latest = history[history.length - 1]!;
      const trend = computeTrend(history);
      const result = toWebCampaignResult(latest, trend, latestCapture, demoCampaign.name);
      return NextResponse.json({ ok: true, result });
    }

    // ── Custom: single offline run (one trend point) ────────────────────────
    const data = parsed.data as { campaign: z.infer<typeof CampaignSchema> };
    const c = data.campaign;
    const campaign: Campaign = {
      id: `web-${c.brand.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: c.name ?? `${c.brand.name} — AI visibility`,
      brand: { name: c.brand.name, domain: c.brand.domain, aliases: c.brand.aliases },
      competitors: c.competitors?.map((x) => ({ name: x.name, domain: x.domain })),
      prompts: c.prompts.map((p) => ({ prompt: p.text, weight: p.weight })),
    };

    const fallbackCitations = c.brand.domain
      ? [{ url: `https://${c.brand.domain}`, title: c.brand.name }]
      : [];
    const capture = new Map<string, EngineResponse[]>();
    const providers = [
      withCapture(
        new MockProvider({
          engine: 'mock',
          fallback: { text: `${c.brand.name} is a notable player in this space.`, citations: fallbackCitations },
        }),
        capture,
      ),
    ];

    const run = await runCampaign(campaign, providers);
    const trend = computeTrend([run]);
    const result = toWebCampaignResult(run, trend, capture, campaign.name);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Campaign run failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
