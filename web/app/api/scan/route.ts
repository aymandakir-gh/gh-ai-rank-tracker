/**
 * POST /api/scan — Next.js API route
 *
 * Proxies the scan request to the gh-ai-rank-tracker Hono backend.
 * SCAN_API_URL env var (default: http://localhost:3000) points to the server.
 * SCAN_API_KEY env var (optional) adds Bearer auth for the upstream call.
 *
 * Architecture: Next.js web UI (port 3001) ↔ Hono API server (port 3000)
 */
import { NextRequest, NextResponse } from 'next/server'

const SCAN_API_URL = process.env.SCAN_API_URL ?? 'http://localhost:3000'
const SCAN_API_KEY = process.env.SCAN_API_KEY ?? ''

interface ScanRequestBody {
  url?: unknown
  providers?: unknown
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Parse body
  let body: ScanRequestBody
  try {
    body = (await req.json()) as ScanRequestBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  // 2. Validate url field
  if (typeof body.url !== 'string' || !body.url.trim()) {
    return NextResponse.json(
      { ok: false, error: 'Missing required field: url (must be a non-empty string)' },
      { status: 400 },
    )
  }

  // 3. Normalize providers — default to ["mock"]
  const providers: string[] =
    Array.isArray(body.providers) && (body.providers as unknown[]).length > 0
      ? (body.providers as string[])
      : ['mock']

  // 4. Build upstream headers
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (SCAN_API_KEY) {
    headers['Authorization'] = `Bearer ${SCAN_API_KEY}`
  }

  // 5. Forward to Hono backend
  try {
    const upstream = await fetch(`${SCAN_API_URL}/api/scan`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: body.url, providers }),
      signal: AbortSignal.timeout(30_000),
    })

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream scan failed'
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
