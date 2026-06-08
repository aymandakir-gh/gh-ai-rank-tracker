import type {
  Brand,
  CoverageStats,
  EngineResponse,
  PromptScore,
  Recommendation,
  ShareOfVoiceEntry,
  TrackingConfig,
  TrackingReport,
} from "./types";
import type { AnswerEngineProvider } from "./providers";
import {
  type ScoreWeights,
  DEFAULT_WEIGHTS,
  aggregatePrompt,
  overallScore,
  coverage,
  shareOfVoice,
} from "./score";

export interface RunOptions {
  /** Override the default scoring weights. */
  weights?: ScoreWeights;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}

/**
 * Run a full tracking pass: every prompt is queried against every provider,
 * scored for the tracked brand, benchmarked for share-of-voice against
 * competitors, and summarized into a single report.
 */
export async function runTracking(
  config: TrackingConfig,
  providers: AnswerEngineProvider[],
  opts: RunOptions = {},
): Promise<TrackingReport> {
  if (!providers.length) throw new Error("runTracking: at least one provider is required");
  if (!config.prompts.length) throw new Error("runTracking: config.prompts is empty");

  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const now = opts.now ?? (() => new Date());

  const allResponses: EngineResponse[] = [];
  const promptScores: PromptScore[] = [];

  for (const spec of config.prompts) {
    const weight = spec.weight ?? 1;
    const responses = await Promise.all(providers.map((p) => p.query(spec.prompt)));
    allResponses.push(...responses);
    promptScores.push(aggregatePrompt(spec.prompt, weight, responses, config.brand, weights));
  }

  const brands: Brand[] = [config.brand, ...(config.competitors ?? [])];
  const sov = shareOfVoice(allResponses, brands);
  const cov = coverage(promptScores);
  const visibilityScore = overallScore(promptScores);
  const gaps = promptScores.filter((p) => !p.mentionedAnywhere).map((p) => p.prompt);

  return {
    brand: config.brand.name,
    generatedAt: now().toISOString(),
    engines: providers.map((p) => p.engine),
    visibilityScore,
    coverage: cov,
    prompts: promptScores,
    gaps,
    shareOfVoice: sov,
    recommendations: buildRecommendations(config.brand.name, visibilityScore, cov, gaps, sov),
  };
}

/** Derive prioritized, rule-based recommendations from a run's aggregates. */
export function buildRecommendations(
  brandName: string,
  visibility: number,
  cov: CoverageStats,
  gaps: string[],
  sov: ShareOfVoiceEntry[],
): Recommendation[] {
  const recs: Recommendation[] = [];

  if (visibility < 30) {
    recs.push({
      severity: "high",
      message: `Low AI visibility (${visibility}/100). ${brandName} is largely absent from answer engines for these prompts — prioritize GEO/AEO content and citable, original sources.`,
    });
  } else if (visibility < 60) {
    recs.push({
      severity: "medium",
      message: `Moderate AI visibility (${visibility}/100). Room to improve mention prominence and earn more top-ranked citations.`,
    });
  } else {
    recs.push({
      severity: "low",
      message: `Strong AI visibility (${visibility}/100). Defend the position and expand coverage to adjacent prompts.`,
    });
  }

  if (gaps.length) {
    const sample = gaps
      .slice(0, 3)
      .map((g) => `"${g}"`)
      .join(", ");
    recs.push({
      severity: gaps.length >= cov.totalPrompts / 2 ? "high" : "medium",
      message: `${gaps.length}/${cov.totalPrompts} prompts return no mention of ${brandName}. Create authoritative, directly-quotable content targeting: ${sample}${gaps.length > 3 ? "…" : ""}.`,
    });
  }

  if (cov.citationRate < 0.5) {
    recs.push({
      severity: "medium",
      message: `Cited in only ${Math.round(cov.citationRate * 100)}% of prompts. Publish original data and keep pages crawlable so engines link to ${brandName} directly.`,
    });
  }

  const leader = sov[0];
  const me = sov.find((s) => s.brand === brandName);
  if (leader && me && leader.brand !== brandName && leader.presence > me.presence) {
    recs.push({
      severity: "medium",
      message: `${leader.brand} leads share-of-voice (${Math.round(leader.share * 100)}% vs your ${Math.round(me.share * 100)}%). Study the prompts where it gets cited and target the same intents.`,
    });
  }

  return recs;
}
