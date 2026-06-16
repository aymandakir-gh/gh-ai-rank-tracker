/**
 * Campaigns — the unit of repeated, multi-prompt tracking.
 *
 * A {@link Campaign} bundles a brand, its competitors, a *set* of prompts and
 * the engines to query. {@link runCampaign} executes the whole set through every
 * provider, scores the tracked brand, aggregates share-of-voice across prompts ×
 * engines, computes a per-engine breakdown and a head-to-head competitor
 * comparison, and returns a {@link CampaignRun} that can be appended to a
 * {@link TrackingStore} to build history over time.
 */
import type { Brand, PromptSpec, TrackingReport } from "./types";
import type { AnswerEngineProvider } from "./providers";
import { runTracking, type RunOptions } from "./tracker";
import { round1, round2 } from "./score";

/** A named, reusable tracking campaign: brand + competitors + prompt set + engines. */
export interface Campaign {
  /** Stable identifier (slug). Used as the history key in a {@link TrackingStore}. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** The brand being tracked. */
  brand: Brand;
  /** Competitors to benchmark share-of-voice against. */
  competitors?: Brand[];
  /** The set of prompts to run on every engine. */
  prompts: PromptSpec[];
  /**
   * Engine ids this campaign targets, e.g. ["openai","perplexity"]. Informational
   * metadata — the actual providers are passed to {@link runCampaign}.
   */
  engines?: string[];
  /** ISO timestamp the campaign was defined. */
  createdAt?: string;
}

/** Per-engine aggregate of the tracked brand's visibility across the prompt set. */
export interface EngineBreakdownEntry {
  engine: string;
  /** Mean visibility score (0..100) for the tracked brand on this engine. */
  score: number;
  /** Fraction of prompts where the brand was mentioned on this engine (0..1). */
  mentionRate: number;
  /** Fraction of prompts where the brand was cited on this engine (0..1). */
  citationRate: number;
  /** Number of prompt responses observed from this engine. */
  responses: number;
}

/** Head-to-head share-of-voice for one brand relative to the tracked brand. */
export interface CompetitorComparisonEntry {
  brand: string;
  /** True for the tracked brand's own row. */
  isTracked: boolean;
  /** 0..1 share of total presence across the tracked brand set. */
  shareOfVoice: number;
  presence: number;
  mentions: number;
  /**
   * SoV gap measured against the tracked brand, in share points (-1..1):
   * `tracked.share - this.share`. Positive ⇒ the tracked brand is ahead of this
   * competitor; negative ⇒ this competitor leads. Always 0 on the tracked row.
   */
  gapVsTracked: number;
}

/** One executed campaign pass: the full report plus campaign-level aggregates. */
export interface CampaignRun {
  campaignId: string;
  /** Unique id for this run within the campaign (used to de-dupe in a store). */
  runId: string;
  generatedAt: string;
  /** Tracked brand name (denormalized for convenient history queries). */
  brand: string;
  /** 0..100 weighted AI Visibility Score for this run (mirrors report.visibilityScore). */
  visibilityScore: number;
  /** The full per-prompt / per-engine tracking report. */
  report: TrackingReport;
  engineBreakdown: EngineBreakdownEntry[];
  competitorComparison: CompetitorComparisonEntry[];
}

/** Build the per-engine breakdown from a tracking report (stable engine order). */
export function engineBreakdown(report: TrackingReport): EngineBreakdownEntry[] {
  const agg = new Map<string, { scoreSum: number; n: number; mentioned: number; cited: number }>();
  for (const p of report.prompts) {
    for (const rs of p.byEngine) {
      const e = agg.get(rs.engine) ?? { scoreSum: 0, n: 0, mentioned: 0, cited: 0 };
      e.scoreSum += rs.score;
      e.n += 1;
      if (rs.mention.mentioned) e.mentioned += 1;
      if (rs.citation.cited) e.cited += 1;
      agg.set(rs.engine, e);
    }
  }
  return report.engines.map((engine) => {
    const e = agg.get(engine);
    if (!e || e.n === 0) {
      return { engine, score: 0, mentionRate: 0, citationRate: 0, responses: 0 };
    }
    return {
      engine,
      score: round1(e.scoreSum / e.n),
      mentionRate: round2(e.mentioned / e.n),
      citationRate: round2(e.cited / e.n),
      responses: e.n,
    };
  });
}

/**
 * Build a head-to-head competitor comparison from a report's share-of-voice.
 * Preserves the SoV ordering (presence desc) and tags the tracked brand row.
 */
export function competitorComparison(report: TrackingReport): CompetitorComparisonEntry[] {
  const tracked = report.shareOfVoice.find((s) => s.brand === report.brand);
  const trackedShare = tracked?.share ?? 0;
  return report.shareOfVoice.map((s) => {
    const isTracked = s.brand === report.brand;
    return {
      brand: s.brand,
      isTracked,
      shareOfVoice: s.share,
      presence: s.presence,
      mentions: s.mentions,
      gapVsTracked: isTracked ? 0 : round2(trackedShare - s.share),
    };
  });
}

export interface RunCampaignOptions extends RunOptions {
  /**
   * Stable run-id factory. Defaults to a timestamp + short random suffix so
   * concurrent runs never collide. Inject a deterministic factory in tests.
   */
  idFactory?: () => string;
}

/**
 * Execute a campaign: run the whole prompt set through every provider, score the
 * tracked brand, and assemble campaign-level aggregates into a {@link CampaignRun}.
 */
export async function runCampaign(
  campaign: Campaign,
  providers: AnswerEngineProvider[],
  opts: RunCampaignOptions = {},
): Promise<CampaignRun> {
  const report = await runTracking(
    {
      brand: campaign.brand,
      competitors: campaign.competitors,
      prompts: campaign.prompts,
    },
    providers,
    { weights: opts.weights, now: opts.now },
  );

  const runId = opts.idFactory ? opts.idFactory() : defaultRunId(report.generatedAt);

  return {
    campaignId: campaign.id,
    runId,
    generatedAt: report.generatedAt,
    brand: report.brand,
    visibilityScore: report.visibilityScore,
    report,
    engineBreakdown: engineBreakdown(report),
    competitorComparison: competitorComparison(report),
  };
}

/** Timestamp-based run id with a short random suffix to avoid same-ms collisions. */
function defaultRunId(generatedAt: string): string {
  const ts = Date.parse(generatedAt);
  const stamp = Number.isNaN(ts) ? Date.now() : ts;
  const rand = Math.random().toString(36).slice(2, 8);
  return `run_${stamp}_${rand}`;
}
