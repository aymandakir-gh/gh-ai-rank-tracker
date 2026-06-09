/**
 * POST /api/lead — Next.js API route
 *
 * Proxies lead submissions to the shared gh-leads-core backend (LEADS_API_URL).
 * If LEADS_API_URL is not set (e.g. local dev), returns 200 ok so the UI
 * flow completes without breaking — the lead is effectively a no-op until
 * the backend is wired.
 *
 * Expected body: { email: string, source: string, metadata?: object }
 * Source value: "ai-rank-tracker"
 */
import { NextRequest, NextResponse } from 'next/server'

const LEADS_API_URL = process.env.LEADS_API_URL ?? ''

interface LeadRequestBody {
  email?: unknown
  source?: unknown
  metadata?: unknown
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Parse body
  let body: LeadRequestBody
  try {
    body = (await req.json()) as LeadRequestBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  // 2. Validate email
  if (typeof body.email !== 'string' || !body.email.trim()) {
    return NextResponse.json(
      { ok: false, error: 'Missing required field: email' },
      { status: 400 },
    )
  }

  const email = body.email.trim().toLowerCase()
  const source = typeof body.source === 'string' ? body.source : 'ai-rank-tracker'
  const metadata = body.metadata ?? {}

  // 3. Graceful no-op if backend not configured (local dev)
  if (!LEADS_API_URL) {
    // Log in dev so it's visible in terminal
    console.info('[lead] LEADS_API_URL not set — skipping backend submission', {
      email,
      source,
      metadata,
    })
    return NextResponse.json({ ok: true, source: 'fallback' })
  }

  // 4. Forward to gh-leads-core
  try {
    const upstream = await fetch(`${LEADS_API_URL}/api/lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source, metadata }),
      signal: AbortSignal.timeout(10_000),
    })

    const data: unknown = await upstream.json().catch(() => ({}))

    // Pass through status: 200 ok, 409 duplicate (still ok from UX POV), 4xx/5xx errors
    if (upstream.status === 409) {
      // Duplicate email — not an error from the user's perspective
      return NextResponse.json({ ok: true, source: 'duplicate' })
    }

    if (!upstream.ok) {
      const errData = data as { error?: string }
      return NextResponse.json(
        { ok: false, error: errData.error ?? `Upstream error ${upstream.status}` },
        { status: upstream.status >= 500 ? 502 : upstream.status },
      )
    }

    return NextResponse.json({ ok: true, source: 'backend' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lead submission failed'
    console.error('[lead] upstream error:', message)
    // Fail open: return 200 so the UX gate completes even if backend is down
    return NextResponse.json({ ok: true, source: 'fallback', warning: message })
  }
}
