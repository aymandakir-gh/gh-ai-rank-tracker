/**
 * POST /api/lead — Next.js 14 App Router API route
 *
 * Server-side proxy for email gate lead capture. Keeps LEADS_API_URL out of
 * the browser bundle. Fails open so the share flow completes even if the
 * backend is down or unconfigured (local dev / OSS deploy).
 *
 * Body accepted:  { email, brandName?, visibilityScore? }
 * Body forwarded: { email, brandName, visibilityScore, source: "ai-rank-tracker" }
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const LEADS_API_URL = process.env.LEADS_API_URL ?? '';

const LeadSchema = z.object({
  email: z.string().email().max(254),
  brandName: z.string().max(200).optional(),
  visibilityScore: z.number().min(0).max(100).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Parse + validate
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = LeadSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Validation failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  const { email, brandName, visibilityScore } = parsed.data;

  // Graceful no-op if LEADS_API_URL not configured
  if (!LEADS_API_URL) {
    console.info('[lead] LEADS_API_URL not set — skipping submission', { email });
    return NextResponse.json({ ok: true, source: 'fallback' });
  }

  try {
    const upstream = await fetch(`${LEADS_API_URL}/api/lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, brandName, visibilityScore, source: 'ai-rank-tracker' }),
      signal: AbortSignal.timeout(10_000),
    });

    // 409 = duplicate email — not an error from the user's perspective
    if (upstream.status === 409) {
      return NextResponse.json({ ok: true, source: 'duplicate' });
    }

    if (!upstream.ok) {
      return NextResponse.json(
        { ok: false, error: `Lead submission failed (${upstream.status})` },
        { status: upstream.status >= 500 ? 502 : upstream.status },
      );
    }

    return NextResponse.json({ ok: true, source: 'backend' });
  } catch (err) {
    // Fail open — share flow should complete even if backend is unavailable
    const message = err instanceof Error ? err.message : 'Lead submission failed';
    console.error('[lead] upstream error:', message);
    return NextResponse.json({ ok: true, source: 'fallback', warning: message });
  }
}
