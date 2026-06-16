import { describe, it, expect } from 'vitest'
import { webCampaignToMarkdown } from '@/lib/report-markdown'
import type { WebCampaignResult } from '@/lib/types'

const RESULT: WebCampaignResult = {
  campaignName: 'Acme GEO',
  brand: 'Acme',
  generatedAt: '2026-06-08T00:00:00.000Z',
  visibilityScore: 64,
  visibilityDelta: 12,
  shareOfVoiceDelta: 8,
  trend: [
    { date: '2026-06-01T00:00:00.000Z', visibility: 52, shareOfVoice: 30 },
    { date: '2026-06-08T00:00:00.000Z', visibility: 64, shareOfVoice: 38 },
  ],
  engineBreakdown: [{ engine: 'perplexity', score: 64, mentionRate: 75, citationRate: 50 }],
  competitors: [
    { brand: 'Acme', isTracked: true, shareOfVoice: 38, gapVsTracked: 0 },
    { brand: 'Rival', isTracked: false, shareOfVoice: 30, gapVsTracked: 8 },
  ],
  prompts: [
    { prompt: 'best widget vendor', weight: 1, score: 80, mentions: 2, citations: [{ engine: 'perplexity', rank: 1 }] },
  ],
  runCount: 2,
}

describe('webCampaignToMarkdown', () => {
  it('renders headline, sections and rows from a WebCampaignResult', () => {
    const md = webCampaignToMarkdown(RESULT)
    expect(md).toContain('# AI Visibility Report — Acme')
    expect(md).toContain('**Campaign:** Acme GEO')
    expect(md).toContain('**AI Visibility Score:** 64/100')
    expect(md).toContain('**Since first run:** +12 visibility · +8% share of voice')
    expect(md).toContain('## Share of voice over time')
    expect(md).toContain('| 2026-06-08T00:00:00.000Z | 64/100 | 38% |')
    expect(md).toContain('## Per-engine breakdown')
    expect(md).toContain('| perplexity | 64/100 | 75% | 50% |')
    expect(md).toContain('Acme (you)')
    expect(md).toContain('best widget vendor')
  })

  it('omits the delta line for a single-run result', () => {
    const md = webCampaignToMarkdown({ ...RESULT, runCount: 1, trend: [RESULT.trend[1]!] })
    expect(md).not.toContain('Since first run')
  })

  it('escapes pipe characters in brand/prompt text', () => {
    const md = webCampaignToMarkdown({
      ...RESULT,
      prompts: [{ prompt: 'a | b', weight: 1, score: 10, mentions: 0, citations: [] }],
    })
    expect(md).toContain('a \\| b')
  })
})
