import { describe, it, expect } from "vitest";
import { computeTrend } from "../src/trends";
import type { CampaignRun } from "../src/campaign";

function run(
  runId: string,
  generatedAt: string,
  visibility: number,
  trackedShare: number,
  rivalShare: number,
  scoreByEngine: Record<string, number> = { mock: visibility },
): CampaignRun {
  return {
    campaignId: "c1",
    runId,
    generatedAt,
    brand: "Acme",
    visibilityScore: visibility,
    report: {
      brand: "Acme",
      generatedAt,
      engines: Object.keys(scoreByEngine),
      visibilityScore: visibility,
      coverage: { totalPrompts: 1, totalResponses: 1, mentionRate: 1, citationRate: 1 },
      prompts: [],
      gaps: [],
      shareOfVoice: [],
      recommendations: [],
    },
    engineBreakdown: Object.entries(scoreByEngine).map(([engine, score]) => ({
      engine,
      score,
      mentionRate: 1,
      citationRate: 1,
      responses: 1,
    })),
    competitorComparison: [
      { brand: "Acme", isTracked: true, shareOfVoice: trackedShare, presence: 1, mentions: 1, gapVsTracked: 0 },
      { brand: "Rival", isTracked: false, shareOfVoice: rivalShare, presence: 1, mentions: 1, gapVsTracked: trackedShare - rivalShare },
    ],
  };
}

describe("computeTrend", () => {
  it("orders points oldest-first regardless of input order", () => {
    const trend = computeTrend([
      run("r3", "2026-06-03T00:00:00.000Z", 70, 0.6, 0.4),
      run("r1", "2026-06-01T00:00:00.000Z", 30, 0.3, 0.7),
      run("r2", "2026-06-02T00:00:00.000Z", 50, 0.5, 0.5),
    ]);
    expect(trend.points.map((p) => p.runId)).toEqual(["r1", "r2", "r3"]);
    expect(trend.brand).toBe("Acme");
  });

  it("computes first→last deltas for visibility and tracked share-of-voice", () => {
    const trend = computeTrend([
      run("r1", "2026-06-01T00:00:00.000Z", 30, 0.3, 0.7),
      run("r2", "2026-06-08T00:00:00.000Z", 75, 0.65, 0.35),
    ]);
    expect(trend.visibilityDelta).toBe(45);
    expect(trend.shareOfVoiceDelta).toBeCloseTo(0.35, 5);
  });

  it("exposes per-brand share and per-engine score on each point", () => {
    const trend = computeTrend([
      run("r1", "2026-06-01T00:00:00.000Z", 40, 0.4, 0.6, { openai: 50, perplexity: 30 }),
    ]);
    const p = trend.points[0]!;
    expect(p.shareOfVoice).toBe(0.4);
    expect(p.shareByBrand).toEqual({ Acme: 0.4, Rival: 0.6 });
    expect(p.scoreByEngine).toEqual({ openai: 50, perplexity: 30 });
  });

  it("returns zero deltas for a single point", () => {
    const trend = computeTrend([run("r1", "2026-06-01T00:00:00.000Z", 40, 0.4, 0.6)]);
    expect(trend.points).toHaveLength(1);
    expect(trend.visibilityDelta).toBe(0);
    expect(trend.shareOfVoiceDelta).toBe(0);
  });

  it("handles an empty history", () => {
    const trend = computeTrend([]);
    expect(trend).toEqual({ brand: "", points: [], visibilityDelta: 0, shareOfVoiceDelta: 0 });
  });
});
