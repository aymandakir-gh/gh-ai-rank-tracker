/**
 * W6·QA — Next.js /api/scan proxy route unit tests
 * Coverage: body validation · provider defaulting · upstream forwarding · error handling
 * Run via root vitest: npx vitest run tests/web/scan-route.test.ts
 *
 * Mock strategy: vi.mock hoisting replaces next/server before the route module
 * loads, giving us a lightweight NextRequest/NextResponse that works in Node.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mock next/server ─────────────────────────────────────────────────────────
// Must be declared BEFORE imports; vitest hoists vi.mock() to top of file.

vi.mock('next/server', () => {
  class MockNextRequest {
    private _body: string
    constructor(_url: string, init?: { method?: string; body?: string }) {
      this._body = init?.body ?? '{}'
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

// Import AFTER vi.mock so the hoisted mock is in place
import { POST } from '../../web/app/api/scan/route'
import { NextRequest } from 'next/server'

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface MockResponse {
  _data: unknown
  status: number
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/scan', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function makeInvalidJsonReq(): NextRequest {
  // Returns a request whose .json() throws (simulates malformed body)
  const bad = {
    json: async (): Promise<never> => {
      throw new SyntaxError('Unexpected token')
    },
  } as unknown as NextRequest
  return bad
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/scan proxy route', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Default: well-behaved upstream
    fetchSpy = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true, result: { visibilityScore: 80 } }),
    })
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── Validation ──────────────────────────────────────────────────────────────

  it('returns 400 for invalid JSON body', async () => {
    const res = (await POST(makeInvalidJsonReq())) as unknown as MockResponse
    expect(res.status).toBe(400)
    expect((res._data as { ok: boolean }).ok).toBe(false)
    expect((res._data as { error: string }).error).toBe('Invalid JSON body')
  })

  it('returns 400 when url field is missing', async () => {
    const res = (await POST(makeReq({ providers: ['mock'] }))) as unknown as MockResponse
    expect(res.status).toBe(400)
    expect((res._data as { ok: boolean }).ok).toBe(false)
  })

  it('returns 400 when url is an empty string', async () => {
    const res = (await POST(makeReq({ url: '', providers: ['mock'] }))) as unknown as MockResponse
    expect(res.status).toBe(400)
    expect((res._data as { ok: boolean }).ok).toBe(false)
  })

  it('returns 400 when url is whitespace-only', async () => {
    const res = (await POST(makeReq({ url: '   ', providers: ['mock'] }))) as unknown as MockResponse
    expect(res.status).toBe(400)
    expect((res._data as { ok: boolean }).ok).toBe(false)
  })

  it('returns 400 when url is not a string (number)', async () => {
    const res = (await POST(makeReq({ url: 123, providers: ['mock'] }))) as unknown as MockResponse
    expect(res.status).toBe(400)
  })

  // ── Provider defaulting ──────────────────────────────────────────────────────

  it('defaults providers to ["mock"] when empty array is provided', async () => {
    await POST(makeReq({ url: 'https://example.com', providers: [] }))
    expect(fetchSpy).toHaveBeenCalledOnce()
    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, { body: string }])[1].body) as { providers: string[] }
    expect(body.providers).toEqual(['mock'])
  })

  it('defaults providers to ["mock"] when providers field is absent', async () => {
    await POST(makeReq({ url: 'https://example.com' }))
    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, { body: string }])[1].body) as { providers: string[] }
    expect(body.providers).toEqual(['mock'])
  })

  it('forwards providers array when non-empty', async () => {
    await POST(makeReq({ url: 'https://example.com', providers: ['mock', 'perplexity'] }))
    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, { body: string }])[1].body) as { providers: string[] }
    expect(body.providers).toEqual(['mock', 'perplexity'])
  })

  // ── Upstream forwarding ──────────────────────────────────────────────────────

  it('returns 502 when upstream fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')))
    const res = (await POST(makeReq({ url: 'https://example.com', providers: ['mock'] }))) as unknown as MockResponse
    expect(res.status).toBe(502)
    expect((res._data as { ok: boolean }).ok).toBe(false)
    expect((res._data as { error: string }).error).toContain('Connection refused')
  })

  it('proxies upstream HTTP status code (e.g. 429 rate limit)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 429,
      json: async () => ({ ok: false, error: 'Rate limit exceeded' }),
    }))
    const res = (await POST(makeReq({ url: 'https://example.com', providers: ['mock'] }))) as unknown as MockResponse
    expect(res.status).toBe(429)
  })

  it('sets Content-Type header on upstream call', async () => {
    await POST(makeReq({ url: 'https://example.com', providers: ['mock'] }))
    const headers = (fetchSpy.mock.calls[0] as [string, { headers: Record<string, string> }])[1].headers
    expect(headers['Content-Type']).toBe('application/json')
  })
})
