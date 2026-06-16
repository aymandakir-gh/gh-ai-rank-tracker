/**
 * POST /api/scan — Next.js App Router route (engine-backed) unit tests.
 *
 * The route runs the AI Rank Tracker engine in-process (no upstream proxy):
 * it rate-limits per IP, validates the body with a zod schema, runs a scan
 * through MockProvider/demo providers, and maps the report to the web result
 * shape. These tests cover validation, the happy path (demo + custom brand,
 * both offline), and the per-IP rate limit. No network is hit.
 *
 * next/server is mocked (vi.mock is hoisted) with a lightweight NextRequest
 * that supports .headers.get() + .json(), and a NextResponse.json() that
 * records status + data.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/server', () => {
  class MockNextRequest {
    private _body: string
    private _headers: Map<string, string>
    constructor(
      _url: string,
      init?: { method?: string; body?: string; headers?: Record<string, string> },
    ) {
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
    json(data: unknown, init?: { status?: number }): MockResponse {
      return { _data: data, status: init?.status ?? 200 }
    },
  }

  return { NextRequest: MockNextRequest, NextResponse }
})

import { POST } from '@/app/api/scan/route'
import { NextRequest } from 'next/server'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MockResponse {
  _data: unknown
  status: number
}

interface ScanBody {
  ok: boolean
  result?: { visibilityScore: number; brandName: string }
  error?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let ipCounter = 0

/** Build a request with a unique IP so the per-IP rate limiter does not bleed
 *  across independent test cases. */
function makeReq(body: unknown): NextRequest {
  ipCounter += 1
  return new NextRequest('http://localhost/api/scan', {
    method: 'POST',
    headers: { 'x-forwarded-for': `10.1.0.${ipCounter}` },
    body: JSON.stringify(body),
  })
}

/** A request whose .json() throws (malformed body), with its own IP. */
function makeInvalidJsonReq(): NextRequest {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === 'x-forwarded-for' ? '10.9.9.9' : null) },
    json: async (): Promise<never> => {
      throw new SyntaxError('Unexpected token')
    },
  } as unknown as NextRequest
}

const demoBody = { brand: { name: 'Acme' }, prompts: [{ text: 'best tools' }], useDemo: true }

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/scan route (engine-backed)', () => {
  it('returns 400 for invalid JSON body', async () => {
    const res = (await POST(makeInvalidJsonReq())) as unknown as MockResponse
    expect(res.status).toBe(400)
    expect((res._data as ScanBody).ok).toBe(false)
    expect((res._data as ScanBody).error).toBe('Invalid JSON body')
  })

  it('returns 400 when brand is missing', async () => {
    const res = (await POST(makeReq({ prompts: [{ text: 'x' }] }))) as unknown as MockResponse
    expect(res.status).toBe(400)
    expect((res._data as ScanBody).ok).toBe(false)
  })

  it('returns 400 when prompts is empty', async () => {
    const res = (await POST(
      makeReq({ brand: { name: 'Acme' }, prompts: [] }),
    )) as unknown as MockResponse
    expect(res.status).toBe(400)
    expect((res._data as ScanBody).ok).toBe(false)
  })

  it('runs a demo scan and returns a mapped result (200)', async () => {
    const res = (await POST(makeReq(demoBody))) as unknown as MockResponse
    expect(res.status).toBe(200)
    const body = res._data as ScanBody
    expect(body.ok).toBe(true)
    expect(typeof body.result?.visibilityScore).toBe('number')
  })

  it('runs a custom-brand scan offline (MockProvider) and echoes the brand name (200)', async () => {
    const res = (await POST(
      makeReq({
        brand: { name: 'Acme', domain: 'acme.com' },
        prompts: [{ text: 'best acme alternatives', weight: 2 }],
      }),
    )) as unknown as MockResponse
    expect(res.status).toBe(200)
    const body = res._data as ScanBody
    expect(body.ok).toBe(true)
    expect(body.result?.brandName).toBe('Acme')
  })

  it('enforces a per-IP rate limit (second request from the same IP → 429)', async () => {
    const make = () =>
      new NextRequest('http://localhost/api/scan', {
        method: 'POST',
        headers: { 'x-forwarded-for': '10.5.5.5' },
        body: JSON.stringify(demoBody),
      })
    const first = (await POST(make())) as unknown as MockResponse
    expect(first.status).toBe(200)
    const second = (await POST(make())) as unknown as MockResponse
    expect(second.status).toBe(429)
  })
})
