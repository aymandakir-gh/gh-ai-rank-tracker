/**
 * Core domain types for gh-ai-rank-tracker.
 *
 * GEO/AEO (Generative / Answer Engine Optimization) is about measuring whether
 * AI answer engines mention and cite a brand for the prompts that matter to its
 * category — and how prominently, versus competitors.
 */

/** A brand we want to track (your brand or a competitor). */
export interface Brand {
  /** Canonical display name, e.g. "GrowthHackers". */
  name: string;
  /** Alternate names / spellings / handles that count as the same brand. */
  aliases?: string[];
  /** Primary domain, e.g. "growthackers.io". Used for citation detection. */
  domain?: string;
}

/** A source/link an answer engine cited in its answer. */
export interface Citation {
  url: string;
  title?: string;
}

/** A single answer-engine response to a prompt. */
export interface EngineResponse {
  /** Engine identifier, e.g. "mock", "perplexity", "chatgpt". */
  engine: string;
  /** The prompt that produced this answer. */
  prompt: string;
  /** The full natural-language answer text. */
  text: string;
  /** Structured citations, in the order the engine presented them. */
  citations: Citation[];
  /** Optional raw provider payload, kept for debugging. */
  raw?: unknown;
}

/** A tracked prompt (query) plus optional weight + tags. */
export interface PromptSpec {
  prompt: string;
  /** Relative importance when aggregating the overall score (default 1). */
  weight?: number;
  /** Free-form labels, e.g. ["bottom-funnel", "comparison"]. */
  tags?: string[];
}

/** Full configuration for a tracking run. */
export interface TrackingConfig {
  /** The brand you want to rank/track. */
  brand: Brand;
  /** Competitors to benchmark share-of-voice against. */
  competitors?: Brand[];
  /** Prompts to test across the engines. */
  prompts: PromptSpec[];
}

/** Result of detecting a brand mention inside answer text. */
export interface MentionResult {
  mentioned: boolean;
  /** Number of times any brand term appears. */
  count: number;
  /** Character index of the first mention, or -1. */
  firstIndex: number;
  /** 0..1 prominence (earlier mention = higher). 0 when not mentioned. */
  prominence: number;
  /** Which brand terms matched. */
  matchedTerms: string[];
}

/** Result of detecting a brand citation among an answer's sources. */
export interface CitationResult {
  cited: boolean;
  /** 1-based position of the first matching citation, or -1. */
  rank: number;
  /** Number of citations that resolve to the brand's domain. */
  count: number;
  /** 0..1 prominence (higher = cited nearer the top). 0 when not cited. */
  prominence: number;
}

/** Visibility score for a single (brand, response) pair. */
export interface ResponseScore {
  engine: string;
  prompt: string;
  /** 0..100 visibility score. */
  score: number;
  mention: MentionResult;
  citation: CitationResult;
}

/** Aggregated score for one prompt across all engines. */
export interface PromptScore {
  prompt: string;
  weight: number;
  /** Mean visibility across engines for this prompt. */
  score: number;
  /** True if the brand was mentioned in at least one engine. */
  mentionedAnywhere: boolean;
  /** True if the brand was cited in at least one engine. */
  citedAnywhere: boolean;
  /** Per-engine breakdown. */
  byEngine: ResponseScore[];
}

/** Share-of-voice entry for one brand. */
export interface ShareOfVoiceEntry {
  brand: string;
  /** Number of responses where this brand was mentioned. */
  presence: number;
  /** Total mention occurrences across all responses. */
  mentions: number;
  /** 0..1 share of total presence across the tracked brand set. */
  share: number;
}

/** Coverage stats for the tracked brand. */
export interface CoverageStats {
  totalPrompts: number;
  totalResponses: number;
  /** Fraction of prompts mentioned in >=1 engine (0..1). */
  mentionRate: number;
  /** Fraction of prompts cited in >=1 engine (0..1). */
  citationRate: number;
}

/** A prioritized, rule-based recommendation derived from the run. */
export interface Recommendation {
  severity: "high" | "medium" | "low";
  message: string;
}

/** The full report produced by a tracking run. */
export interface TrackingReport {
  brand: string;
  generatedAt: string;
  engines: string[];
  /** 0..100 weighted overall AI Visibility Score. */
  visibilityScore: number;
  coverage: CoverageStats;
  prompts: PromptScore[];
  /** Prompts (by text) where the brand was invisible across all engines. */
  gaps: string[];
  shareOfVoice: ShareOfVoiceEntry[];
  recommendations: Recommendation[];
}
