/**
 * Campaign dashboard page (/campaign) — integration tests.
 *
 * Mocks next/navigation + fetch. Asserts: the demo flow renders the trend,
 * per-engine breakdown, competitor comparison and drill-down; the drill-down
 * expands; and the page is genuinely i18n'd via ?lang=.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WebCampaignResult } from '@/lib/types'

const mockGet = vi.hoisted(() => vi.fn((_k: string): string | null => null))
const mockReplace = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mockGet, toString: () => '' }),
  useRouter: () => ({ replace: mockReplace }),
}))

import CampaignPage from '@/app/campaign/page'

const DEMO_RESULT: WebCampaignResult = {
  campaignName: 'GrowthHackers — GEO/AEO visibility',
  brand: 'GrowthHackers',
  generatedAt: '2026-05-25T09:00:00.000Z',
  visibilityScore: 64,
  visibilityDelta: 34,
  shareOfVoiceDelta: 18,
  trend: [
    { date: '2026-05-04T09:00:00.000Z', visibility: 30, shareOfVoice: 22 },
    { date: '2026-05-11T09:00:00.000Z', visibility: 45, shareOfVoice: 30 },
    { date: '2026-05-18T09:00:00.000Z', visibility: 58, shareOfVoice: 36 },
    { date: '2026-05-25T09:00:00.000Z', visibility: 64, shareOfVoice: 40 },
  ],
  engineBreakdown: [
    { engine: 'perplexity', score: 66, mentionRate: 75, citationRate: 50 },
    { engine: 'chatgpt', score: 62, mentionRate: 75, citationRate: 25 },
  ],
  competitors: [
    { brand: 'GrowthHackers', isTracked: true, shareOfVoice: 40, gapVsTracked: 0 },
    { brand: 'HubSpot', isTracked: false, shareOfVoice: 35, gapVsTracked: 5 },
  ],
  prompts: [
    {
      prompt: 'best growth marketing agencies for B2B SaaS',
      weight: 2,
      score: 80,
      mentions: 2,
      citations: [{ engine: 'perplexity', rank: 1, url: 'https://growthackers.io/' }],
    },
  ],
  runCount: 4,
}

function mockFetchOnce(result: WebCampaignResult) {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  mockGet.mockImplementation(() => null) // default locale en
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Campaign dashboard — demo flow', () => {
  test('Load demo campaign renders trend, engines, competitors and drill-down', async () => {
    mockFetchOnce(DEMO_RESULT)
    render(<CampaignPage />)

    await userEvent.click(screen.getByRole('button', { name: /load demo campaign/i }))

    // Wait on the (unique) trend chart appearing after the result loads.
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /share of voice over time/i })).toBeInTheDocument(),
    )
    // Score hero label + value present.
    expect(screen.getByText('AI Visibility Score')).toBeInTheDocument()

    // POSTed to the campaign endpoint with useDemo.
    expect(global.fetch).toHaveBeenCalledWith('/api/campaign', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse((vi.mocked(global.fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body.useDemo).toBe(true)

    // Per-engine breakdown shows both engines.
    expect(screen.getByText('perplexity')).toBeInTheDocument()
    expect(screen.getByText('chatgpt')).toBeInTheDocument()
    // Competitor comparison shows the tracked-brand "(you)" marker + a competitor.
    expect(screen.getByText(/\(you\)/i)).toBeInTheDocument()
    expect(screen.getByText('HubSpot')).toBeInTheDocument()
  })

  test('drill-down row expands to reveal the citation URL', async () => {
    mockFetchOnce(DEMO_RESULT)
    render(<CampaignPage />)
    await userEvent.click(screen.getByRole('button', { name: /load demo campaign/i }))
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /share of voice over time/i })).toBeInTheDocument(),
    )

    // Scope to the drill-down region (the form also lists prompts as remove buttons).
    const drilldown = screen.getByRole('region', { name: /per-prompt drill-down/i })
    const promptToggle = within(drilldown).getByRole('button', { name: /best growth marketing agencies/i })
    expect(promptToggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(promptToggle)
    expect(promptToggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(drilldown).getByRole('link', { name: /growthackers\.io/i })).toBeInTheDocument()
  })
})

describe('Campaign dashboard — i18n', () => {
  test('renders French copy when ?lang=fr', () => {
    mockGet.mockImplementation((k: string) => (k === 'lang' ? 'fr' : null))
    render(<CampaignPage />)
    // French hero + CTA from the campaign.* dictionary.
    expect(screen.getByRole('heading', { name: /tableau de bord des campagnes/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /lancer la campagne/i })).toBeInTheDocument()
  })

  test('falls back to English for an unknown lang', () => {
    mockGet.mockImplementation((k: string) => (k === 'lang' ? 'xx' : null))
    render(<CampaignPage />)
    expect(screen.getByRole('heading', { name: /campaign dashboard/i })).toBeInTheDocument()
  })
})

describe('Campaign dashboard — validation', () => {
  test('custom run without a brand name shows the required-field error', async () => {
    render(<CampaignPage />)
    await userEvent.click(screen.getByRole('button', { name: /^run campaign$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/brand name is required/i)
  })
})
