/**
 * POST /api/campaign — Next.js App Router route (engine-backed) unit tests.
 *
 * Demo mode replays the deterministic 4-week history (multi-point trend);
 * custom mode runs once offline (single trend point). No network is hit.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/server', () => {
  class MockNextRequest {
    private _body: string
    private _headers: Map<string, string>
    constructor(_url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) {
      this._body = init?.body ?? '{}'
      this._headers = new Map(Object.entries(init?.headers ?? {}))
    }
    get headers() {
      return { get: (k: string) => this._headers.get(k.toLowerCase()) ?? null }
    }
    async json(): Promise<unknown> {
      return JSON.parse(this._body) as unknown
    }
  }
  const NextResponse = {
    json(data: unknown, init?: { status?: number }) {
      return { _data: data, status: init?.status ?? 200 }
    },
  }
  return { NextRequest: MockNextRequest, NextResponse }
})

import { POST } from '@/app/api/campaign/route'
import { NextRequest } from 'next/server'
import type { WebCampaignResult } from '@/lib/types'

interface MockResponse {
  _data: { ok: boolean; result?: WebCampaignResult; error?: string }
  status: number
}

let ipCounter = 0
function makeReq(body: unknown): NextRequest {
  ipCounter += 1
  return new NextRequest('http://localhost/api/campaign', {
    method: 'POST',
    headers: { 'x-forwarded-for': `10.2.0.${ipCounter}` },
    body: JSON.stringify(body),
  })
}

describe('POST /api/campaign route', () => {
  it('demo mode returns a 4-point rising trend + breakdown + competitors + drilldown', async () => {
    const res = (await POST(makeReq({ useDemo: true }))) as unknown as MockResponse
    expect(res.status).toBe(200)
    const r = res._data.result!
    expect(res._data.ok).toBe(true)
    expect(r.runCount).toBe(4)
    expect(r.trend).toHaveLength(4)
    // Coverage grows over the 4 demo weeks → visibility trends up.
    expect(r.trend[3]!.visibility).toBeGreaterThan(r.trend[0]!.visibility)
    expect(r.visibilityDelta).toBeGreaterThan(0)
    // Two engines, two named competitors + the tracked brand.
    expect(r.engineBreakdown.map((e) => e.engine).sort()).toEqual(['chatgpt', 'perplexity'])
    expect(r.competitors.some((c) => c.isTracked && c.brand === 'GrowthHackers')).toBe(true)
    expect(r.prompts.length).toBeGreaterThan(0)
  })

  it('demo drill-down recovers a GrowthHackers citation URL', async () => {
    const res = (await POST(makeReq({ useDemo: true }))) as unknown as MockResponse
    const allCitations = res._data.result!.prompts.flatMap((p) => p.citations)
    expect(allCitations.some((c) => c.url?.includes('growthackers.io'))).toBe(true)
  })

  it('custom mode runs offline and returns a single trend point', async () => {
    const res = (await POST(
      makeReq({
        campaign: {
          name: 'Acme test',
          brand: { name: 'Acme', domain: 'acme.com' },
          prompts: [{ text: 'best acme alternatives', weight: 2 }],
          competitors: [{ name: 'Rival', domain: 'rival.com' }],
        },
      }),
    )) as unknown as MockResponse
    expect(res.status).toBe(200)
    const r = res._data.result!
    expect(r.brand).toBe('Acme')
    expect(r.runCount).toBe(1)
    expect(r.trend).toHaveLength(1)
    expect(r.competitors.some((c) => c.brand === 'Rival')).toBe(true)
  })

  it('rejects an invalid body with 400', async () => {
    const res = (await POST(makeReq({ campaign: { brand: {} } }))) as unknown as MockResponse
    expect(res.status).toBe(400)
    expect(res._data.ok).toBe(false)
  })

  it('enforces a per-IP rate limit', async () => {
    const make = () =>
      new NextRequest('http://localhost/api/campaign', {
        method: 'POST',
        headers: { 'x-forwarded-for': '10.7.7.7' },
        body: JSON.stringify({ useDemo: true }),
      })
    // 10 allowed, then 429.
    for (let i = 0; i < 10; i++) {
      const ok = (await POST(make())) as unknown as MockResponse
      expect(ok.status).toBe(200)
    }
    const blocked = (await POST(make())) as unknown as MockResponse
    expect(blocked.status).toBe(429)
  })
})
