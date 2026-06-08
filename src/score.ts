import type {
  Brand,
  EngineResponse,
  ResponseScore,
  PromptScore,
  CoverageStats,
  ShareOfVoiceEntry,
} from "./types";
import { detectMention, detectCitation } from "./detect";

/** Tunable weights for the four visibility signals. They define the 0..100 scale. */
export interface ScoreWeights {
  /** Credit for being mentioned at all. */
  mentionPresence: number;
  /** Additional credit scaled by how early the mention appears. */
  mentionProminence: number;
  /** Credit for the brand's domain appearing in the citations. */
  citationPresence: number;
  /** Additional credit scaled by how near the top the citation sits. */
  citationProminence: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  mentionPresence: 35,
  mentionProminence: 20,
  citationPresence: 30,
  citationProminence: 15,
};

export function maxWeight(w: ScoreWeights = DEFAULT_WEIGHTS): number {
  return w.mentionPresence + w.mentionProminence + w.citationPresence + w.citationProminence;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Score a single response for one brand on a 0..100 scale. */
export function scoreResponse(
  response: EngineResponse,
  brand: Brand,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): ResponseScore {
  const mention = detectMention(response.text, brand);
  const citation = detectCitation(response.citations, brand);

  let raw = 0;
  if (mention.mentioned) {
    raw += weights.mentionPresence + weights.mentionProminence * mention.prominence;
  }
  if (citation.cited) {
    raw += weights.citationPresence + weights.citationProminence * citation.prominence;
  }

  const total = maxWeight(weights);
  const score = total > 0 ? round1((raw / total) * 100) : 0;
  return { engine: response.engine, prompt: response.prompt, score, mention, citation };
}

/** Aggregate one prompt's responses (across engines) into a single PromptScore. */
export function aggregatePrompt(
  prompt: string,
  weight: number,
  responses: EngineResponse[],
  brand: Brand,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): PromptScore {
  const byEngine = responses.map((r) => scoreResponse(r, brand, weights));
  const score = byEngine.length
    ? round1(byEngine.reduce((s, r) => s + r.score, 0) / byEngine.length)
    : 0;
  return {
    prompt,
    weight,
    score,
    mentionedAnywhere: byEngine.some((r) => r.mention.mentioned),
    citedAnywhere: byEngine.some((r) => r.citation.cited),
    byEngine,
  };
}

/** Weighted overall visibility score (0..100) across all prompts. */
export function overallScore(prompts: PromptScore[]): number {
  const totalWeight = prompts.reduce((s, p) => s + (p.weight || 0), 0);
  if (totalWeight <= 0) return 0;
  const acc = prompts.reduce((s, p) => s + p.score * (p.weight || 0), 0);
  return round1(acc / totalWeight);
}

/** Coverage stats for the tracked brand. */
export function coverage(prompts: PromptScore[]): CoverageStats {
  const totalPrompts = prompts.length;
  const totalResponses = prompts.reduce((s, p) => s + p.byEngine.length, 0);
  const mentioned = prompts.filter((p) => p.mentionedAnywhere).length;
  const cited = prompts.filter((p) => p.citedAnywhere).length;
  return {
    totalPrompts,
    totalResponses,
    mentionRate: totalPrompts ? round2(mentioned / totalPrompts) : 0,
    citationRate: totalPrompts ? round2(cited / totalPrompts) : 0,
  };
}

/**
 * Share of voice across a set of brands, measured by presence (number of
 * responses where the brand is mentioned) with mention count as a tiebreaker.
 */
export function shareOfVoice(responses: EngineResponse[], brands: Brand[]): ShareOfVoiceEntry[] {
  const rows: ShareOfVoiceEntry[] = brands.map((b) => {
    let presence = 0;
    let mentions = 0;
    for (const r of responses) {
      const m = detectMention(r.text, b);
      if (m.mentioned) presence++;
      mentions += m.count;
    }
    return { brand: b.name, presence, mentions, share: 0 };
  });

  const totalPresence = rows.reduce((s, r) => s + r.presence, 0);
  for (const r of rows) {
    r.share = totalPresence > 0 ? round2(r.presence / totalPresence) : 0;
  }
  return rows.sort((a, b) => b.presence - a.presence || b.mentions - a.mentions);
}
