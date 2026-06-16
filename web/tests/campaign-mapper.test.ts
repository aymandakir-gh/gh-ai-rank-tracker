import { describe, it, expect } from 'vitest'
import {
  runCampaign,
  computeTrend,
  MockProvider,
  type AnswerEngineProvider,
  type EngineResponse,
  type Campaign,
  type CampaignRun,
} from '@engine'
import { toWebCampaignResult } from '@/lib/campaign-mapper'

const FIXED = () => new Date('2026-06-08T00:00:00.000Z')

const campaign: Campaign = {
  id: 'acme',
  name: 'Acme GEO',
  brand: { name: 'Acme', domain: 'acme.com' },
  competitors: [{ name: 'Rival', domain: 'rival.com' }],
  prompts: [{ prompt: 'p1', weight: 1 }, { prompt: 'p2', weight: 1 }],
  engines: ['e1', 'e2'],
}

/** Capture proxy mirroring the API route, so citation URLs survive into the map. */
function withCapture(inner: AnswerEngineProvider, store: Map<string, EngineResponse[]>): AnswerEngineProvider {
  return {
    engine: inner.engine,
    async query(prompt: string) {
      const r = await inner.query(prompt)
      const arr = store.get(prompt) ?? []
      arr.push(r)
      store.set(prompt, arr)
      return r
    },
  }
}

function providers() {
  const e1 = new MockProvider({
    engine: 'e1',
    script: {
      p1: { text: 'Acme leads.', citations: [{ url: 'https://acme.com/x' }] },
      p2: { text: 'Rival wins.', citations: [{ url: 'https://rival.com/y' }] },
    },
  })
  const e2 = new MockProvider({
    engine: 'e2',
    script: {
      p1: { text: 'Acme is solid.', citations: [] },
      p2: { text: 'nothing here.', citations: [] },
    },
  })
  return [e1, e2]
}

async function runWithCapture(): Promise<{ run: CampaignRun; capture: Map<string, EngineResponse[]> }> {
  const capture = new Map<string, EngineResponse[]>()
  const wrapped = providers().map((p) => withCapture(p, capture))
  const run = await runCampaign(campaign, wrapped, { now: FIXED, idFactory: () => 'r1' })
  return { run, capture }
}

describe('toWebCampaignResult', () => {
  it('maps a single run to a one-point trend with 0..100 SoV', async () => {
    const { run, capture } = await runWithCapture()
    const result = toWebCampaignResult(run, computeTrend([run]), capture, campaign.name)

    expect(result.campaignName).toBe('Acme GEO')
    expect(result.brand).toBe('Acme')
    expect(result.runCount).toBe(1)
    expect(result.trend).toHaveLength(1)
    expect(result.trend[0]!.shareOfVoice).toBeGreaterThan(0)
    expect(result.trend[0]!.shareOfVoice).toBeLessThanOrEqual(100)
    expect(result.visibilityScore).toBe(Math.round(run.visibilityScore))
  })

  it('maps the per-engine breakdown with rates scaled to 0..100', async () => {
    const { run, capture } = await runWithCapture()
    const result = toWebCampaignResult(run, computeTrend([run]), capture)
    const e1 = result.engineBreakdown.find((e) => e.engine === 'e1')!
    expect(e1.mentionRate).toBe(50) // mentioned in 1/2 prompts
    expect(e1.citationRate).toBe(50)
    expect(result.engineBreakdown.find((e) => e.engine === 'e2')!.citationRate).toBe(0)
  })

  it('maps competitor comparison and flags the tracked brand', async () => {
    const { run, capture } = await runWithCapture()
    const result = toWebCampaignResult(run, computeTrend([run]), capture)
    const acme = result.competitors.find((c) => c.brand === 'Acme')!
    const rival = result.competitors.find((c) => c.brand === 'Rival')!
    expect(acme.isTracked).toBe(true)
    expect(acme.gapVsTracked).toBe(0)
    expect(rival.gapVsTracked).toBeGreaterThan(0) // Acme ahead
    expect(acme.shareOfVoice).toBeGreaterThan(0)
  })

  it('recovers per-prompt citation URLs from the capture map', async () => {
    const { run, capture } = await runWithCapture()
    const result = toWebCampaignResult(run, computeTrend([run]), capture)
    const p1 = result.prompts.find((p) => p.prompt === 'p1')!
    expect(p1.mentions).toBeGreaterThan(0)
    const acmeCite = p1.citations.find((c) => c.engine === 'e1')
    expect(acmeCite?.url).toBe('https://acme.com/x')
    expect(acmeCite?.rank).toBe(1)
  })

  it('computes deltas across a multi-run trend', async () => {
    const low = await runCampaign(
      { ...campaign, prompts: [{ prompt: 'p2' }] }, // Acme absent on e1/e2 for p2 → low
      providers(),
      { now: () => new Date('2026-06-01T00:00:00.000Z'), idFactory: () => 'r0' },
    )
    const { run: high } = await runWithCapture()
    const trend = computeTrend([low, high])
    const result = toWebCampaignResult(high, trend, undefined)
    expect(result.runCount).toBe(2)
    expect(result.trend).toHaveLength(2)
    expect(result.visibilityDelta).toBe(Math.round(trend.visibilityDelta))
  })
})
