/**
 * Maps an engine {@link CampaignRun} + {@link Trend} (+ captured raw responses)
 * to the {@link WebCampaignResult} shape the dashboard renders.
 *
 * Like the scan mapper, citation URLs are recovered from a capture Map built in
 * the API route (TrackingReport keeps only rank/count, not the URL). Drill-down
 * citations degrade gracefully to engine+rank when no URL was captured.
 */
import type { CampaignRun, Trend, EngineResponse } from '@engine';
import type {
  WebCampaignResult,
  WebTrendPoint,
  WebEngineBreakdown,
  WebCompetitorEntry,
  WebPromptDrilldown,
} from './types';

export function toWebCampaignResult(
  run: CampaignRun,
  trend: Trend,
  capturedByPrompt?: Map<string, EngineResponse[]>,
  campaignName = '',
): WebCampaignResult {
  const trendPoints: WebTrendPoint[] = trend.points.map((p) => ({
    date: p.generatedAt,
    visibility: Math.round(p.visibilityScore),
    shareOfVoice: Math.round(p.shareOfVoice * 100),
  }));

  const engineBreakdown: WebEngineBreakdown[] = run.engineBreakdown.map((e) => ({
    engine: e.engine,
    score: Math.round(e.score),
    mentionRate: Math.round(e.mentionRate * 100),
    citationRate: Math.round(e.citationRate * 100),
  }));

  const competitors: WebCompetitorEntry[] = run.competitorComparison.map((c) => ({
    brand: c.brand,
    isTracked: c.isTracked,
    shareOfVoice: Math.round(c.shareOfVoice * 100),
    gapVsTracked: Math.round(c.gapVsTracked * 100),
  }));

  const prompts: WebPromptDrilldown[] = run.report.prompts.map((ps) => {
    const captured = capturedByPrompt?.get(ps.prompt) ?? [];
    const citations: WebPromptDrilldown['citations'] = [];
    for (const rs of ps.byEngine) {
      if (rs.citation.cited && rs.citation.rank > 0) {
        const resp = captured.find((r) => r.engine === rs.engine);
        const url = resp?.citations[rs.citation.rank - 1]?.url;
        citations.push({ engine: rs.engine, rank: rs.citation.rank, ...(url ? { url } : {}) });
      }
    }
    // Most prominent (lowest rank) first.
    citations.sort((a, b) => a.rank - b.rank);
    return {
      prompt: ps.prompt,
      weight: ps.weight,
      score: Math.round(ps.score),
      mentions: ps.byEngine.filter((r) => r.mention.mentioned).length,
      citations,
    };
  });

  return {
    campaignName,
    brand: run.brand,
    generatedAt: run.generatedAt,
    visibilityScore: Math.round(run.visibilityScore),
    visibilityDelta: Math.round(trend.visibilityDelta),
    shareOfVoiceDelta: Math.round(trend.shareOfVoiceDelta * 100),
    trend: trendPoints,
    engineBreakdown,
    competitors,
    prompts,
    runCount: trendPoints.length,
  };
}
