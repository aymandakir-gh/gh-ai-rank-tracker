/**
 * Maps the engine's TrackingReport + captured raw EngineResponse data
 * to the web-layer WebScanResult shape consumed by the results page.
 *
 * The capture Map is built in the API route by wrapping each provider with
 * a proxy that stores the raw EngineResponse per prompt. This lets us
 * recover citation URLs that TrackingReport discards (it only stores rank/count).
 */
import type { TrackingReport, EngineResponse } from '@engine';
import type {
  WebScanResult,
  WebBreakdown,
  WebPromptResult,
  WebCitation,
  WebRecommendation,
} from './types';

export function toWebScanResult(
  report: TrackingReport,
  capturedByPrompt?: Map<string, EngineResponse[]>,
): WebScanResult {
  // ── Compute mention + citation prominence averages ────────────────────────
  let mentionProminenceSum = 0;
  let mentionProminenceCount = 0;
  let citationProminenceSum = 0;
  let citationProminenceCount = 0;

  for (const ps of report.prompts) {
    for (const rs of ps.byEngine) {
      if (rs.mention.mentioned) {
        mentionProminenceSum += rs.mention.prominence;
        mentionProminenceCount++;
      }
      if (rs.citation.cited) {
        citationProminenceSum += rs.citation.prominence;
        citationProminenceCount++;
      }
    }
  }

  const breakdown: WebBreakdown = {
    mentionPresence: Math.round(report.coverage.mentionRate * 100),
    mentionProminence:
      mentionProminenceCount > 0
        ? Math.round((mentionProminenceSum / mentionProminenceCount) * 100)
        : 0,
    citationPresence: Math.round(report.coverage.citationRate * 100),
    citationProminence:
      citationProminenceCount > 0
        ? Math.round((citationProminenceSum / citationProminenceCount) * 100)
        : 0,
  };

  // ── Share-of-voice: 0..1 → 0..100 ────────────────────────────────────────
  const shareOfVoice: Record<string, number> = {};
  for (const entry of report.shareOfVoice) {
    shareOfVoice[entry.brand] = Math.round(entry.share * 100);
  }

  // ── Per-prompt results with citation URL recovery ─────────────────────────
  const promptResults: WebPromptResult[] = report.prompts.map((ps) => {
    const captured = capturedByPrompt?.get(ps.prompt) ?? [];
    const citations: WebCitation[] = [];

    for (const rs of ps.byEngine) {
      if (rs.citation.cited && rs.citation.rank > 0) {
        // Find the raw response for this engine so we can extract the URL
        const resp = captured.find((r) => r.engine === rs.engine);
        const url = resp?.citations[rs.citation.rank - 1]?.url;
        if (url) {
          citations.push({ url, rank: rs.citation.rank });
        }
      }
    }

    return {
      prompt: ps.prompt,
      weight: ps.weight,
      score: Math.round(ps.score),
      mentions: ps.byEngine.filter((r) => r.mention.mentioned).length,
      citations,
    };
  });

  // ── Recommendations: severity → priority ─────────────────────────────────
  const recommendations: WebRecommendation[] = report.recommendations.map((r) => ({
    priority: r.severity,
    text: r.message,
  }));

  return {
    visibilityScore: Math.round(report.visibilityScore),
    breakdown,
    shareOfVoice,
    gaps: report.gaps,
    recommendations,
    promptResults,
    brandName: report.brand,
    scannedAt: report.generatedAt,
  };
}
