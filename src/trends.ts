/**
 * Trends — turn a campaign's run history into a time series.
 *
 * Pure functions over an array of {@link CampaignRun}s (no store, no I/O), so
 * the math is fixture-testable on its own. Drives the web trend chart and the
 * exported report's "over time" section.
 */
import type { CampaignRun } from "./campaign";
import { round1, round2 } from "./score";

/** One point in a campaign's trend: a single run's headline numbers. */
export interface TrendPoint {
  runId: string;
  generatedAt: string;
  /** 0..100 weighted AI Visibility Score at this run. */
  visibilityScore: number;
  /** Tracked brand's share-of-voice (0..1) at this run. */
  shareOfVoice: number;
  /** Per-brand share-of-voice (0..1) at this run, keyed by brand name. */
  shareByBrand: Record<string, number>;
  /** Per-engine tracked-brand score (0..100) at this run, keyed by engine. */
  scoreByEngine: Record<string, number>;
}

/** A campaign's full trend: ordered points plus first→last deltas. */
export interface Trend {
  /** Tracked brand name (empty when there are no runs). */
  brand: string;
  /** Trend points, oldest-first. */
  points: TrendPoint[];
  /** visibilityScore(last) − visibilityScore(first); 0 with fewer than 2 points. */
  visibilityDelta: number;
  /** shareOfVoice(last) − shareOfVoice(first); 0 with fewer than 2 points. */
  shareOfVoiceDelta: number;
}

/** Oldest-first by generatedAt, tie-broken by runId. */
function byTimeAsc(a: CampaignRun, b: CampaignRun): number {
  const ta = Date.parse(a.generatedAt);
  const tb = Date.parse(b.generatedAt);
  if (ta !== tb) return ta - tb;
  return a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0;
}

function toPoint(run: CampaignRun): TrendPoint {
  const shareByBrand: Record<string, number> = {};
  for (const c of run.competitorComparison) shareByBrand[c.brand] = c.shareOfVoice;

  const scoreByEngine: Record<string, number> = {};
  for (const e of run.engineBreakdown) scoreByEngine[e.engine] = e.score;

  const tracked = run.competitorComparison.find((c) => c.isTracked);

  return {
    runId: run.runId,
    generatedAt: run.generatedAt,
    visibilityScore: run.visibilityScore,
    shareOfVoice: tracked?.shareOfVoice ?? 0,
    shareByBrand,
    scoreByEngine,
  };
}

/**
 * Compute the trend for a set of runs (assumed to belong to one campaign).
 * Runs are sorted oldest-first; deltas compare the last point to the first.
 */
export function computeTrend(runs: CampaignRun[]): Trend {
  if (runs.length === 0) {
    return { brand: "", points: [], visibilityDelta: 0, shareOfVoiceDelta: 0 };
  }
  const ordered = [...runs].sort(byTimeAsc);
  const points = ordered.map(toPoint);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return {
    brand: ordered[0]!.brand,
    points,
    visibilityDelta: points.length > 1 ? round1(last.visibilityScore - first.visibilityScore) : 0,
    shareOfVoiceDelta:
      points.length > 1 ? round2(last.shareOfVoice - first.shareOfVoice) : 0,
  };
}
