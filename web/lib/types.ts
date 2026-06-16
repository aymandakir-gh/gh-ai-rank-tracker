/**
 * Web-layer types for the AI Rank Tracker dashboard.
 * These are the shapes that flow between the Next.js API route, the results
 * page, and the email gate — completely decoupled from the engine internals.
 */

// ─── Scan request (from the form → POST /api/scan) ───────────────────────────

export interface WebBrand {
  name: string;
  domain?: string;
  aliases?: string[];
}

export interface WebPromptSpec {
  text: string;
  weight: number;
}

export interface WebCompetitor {
  name: string;
  domain?: string;
}

export interface WebScanRequest {
  brand: WebBrand;
  prompts: WebPromptSpec[];
  competitors?: WebCompetitor[];
  useDemo?: boolean;
}

// ─── Scan result (from POST /api/scan → results page) ────────────────────────

export interface WebCitation {
  url: string;
  rank: number;
}

export interface WebPromptResult {
  prompt: string;
  weight: number;
  /** 0..100 visibility score for this prompt. */
  score: number;
  /** Number of engines that mentioned the brand for this prompt. */
  mentions: number;
  citations: WebCitation[];
}

export interface WebBreakdown {
  /** % of prompts where the brand was mentioned in at least one engine (0..100). */
  mentionPresence: number;
  /** Average mention prominence across all mentions (0..100). */
  mentionProminence: number;
  /** % of prompts where the brand was cited in at least one engine (0..100). */
  citationPresence: number;
  /** Average citation prominence across all citations (0..100). */
  citationProminence: number;
}

export interface WebRecommendation {
  priority: 'high' | 'medium' | 'low';
  text: string;
}

export interface WebScanResult {
  /** 0..100 weighted AI Visibility Score. */
  visibilityScore: number;
  breakdown: WebBreakdown;
  /** Brand name → share-of-voice percentage (0..100). */
  shareOfVoice: Record<string, number>;
  /** Prompts where the brand was invisible across all engines. */
  gaps: string[];
  recommendations: WebRecommendation[];
  promptResults: WebPromptResult[];
  brandName: string;
  scannedAt: string;
}

// ─── API response envelope ────────────────────────────────────────────────────

export interface ScanApiResponse {
  ok: boolean;
  result?: WebScanResult;
  error?: string;
}

// ─── Email gate state machine ─────────────────────────────────────────────────

export type EmailGateState =
  | 'idle'
  | 'modal_open'
  | 'validating'
  | 'submitting'
  | 'success'
  | 'submit_error';

// ─── Campaign dashboard (tracking over time) ────────────────────────────────

/** One point on the share-of-voice / visibility trend. */
export interface WebTrendPoint {
  /** ISO timestamp of the run. */
  date: string;
  /** 0..100 weighted visibility score. */
  visibility: number;
  /** 0..100 tracked-brand share of voice. */
  shareOfVoice: number;
}

/** Per-engine aggregate for the tracked brand. */
export interface WebEngineBreakdown {
  engine: string;
  /** 0..100 mean visibility score on this engine. */
  score: number;
  /** 0..100 % of prompts mentioned on this engine. */
  mentionRate: number;
  /** 0..100 % of prompts cited on this engine. */
  citationRate: number;
}

/** Head-to-head competitor row. */
export interface WebCompetitorEntry {
  brand: string;
  isTracked: boolean;
  /** 0..100 share of voice. */
  shareOfVoice: number;
  /** SoV gap vs the tracked brand in points (-100..100); 0 on the tracked row. */
  gapVsTracked: number;
}

/** Per-prompt drill-down with the citations behind the score. */
export interface WebPromptDrilldown {
  prompt: string;
  weight: number;
  /** 0..100 prompt score (mean across engines). */
  score: number;
  /** Number of engines that mentioned the brand. */
  mentions: number;
  /** Citations the brand earned, with engine + rank + (when known) URL. */
  citations: Array<{ engine: string; rank: number; url?: string }>;
}

/** Full campaign dashboard payload. */
export interface WebCampaignResult {
  campaignName: string;
  brand: string;
  generatedAt: string;
  /** 0..100 visibility of the latest run. */
  visibilityScore: number;
  /** Visibility delta first→last run (0 with <2 runs). */
  visibilityDelta: number;
  /** Tracked SoV delta first→last run, in points (0 with <2 runs). */
  shareOfVoiceDelta: number;
  trend: WebTrendPoint[];
  engineBreakdown: WebEngineBreakdown[];
  competitors: WebCompetitorEntry[];
  prompts: WebPromptDrilldown[];
  /** Number of runs in the trend. */
  runCount: number;
}

/** API response envelope for POST /api/campaign. */
export interface CampaignApiResponse {
  ok: boolean;
  result?: WebCampaignResult;
  error?: string;
}
