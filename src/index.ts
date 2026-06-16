/**
 * gh-ai-rank-tracker — public API.
 *
 * A GEO/AEO visibility tracker: measure whether AI answer engines mention and
 * cite your brand for the prompts that matter, score it 0..100, and benchmark
 * share-of-voice against competitors.
 */
export * from "./types";
export * from "./detect";
export * from "./score";
export * from "./providers";
export * from "./tracker";
export * from "./report";
export * from "./campaign";
export * from "./store";
export * from "./trends";
export {
  demoConfig,
  demoProviders,
  demoCampaign,
  demoProvidersForWeek,
  demoCampaignHistory,
} from "./demo";
export { PerplexityProvider, PerplexityApiError } from "./providers/perplexity";
export type { PerplexityOptions } from "./providers/perplexity";
export { OpenAIProvider, OpenAIApiError } from "./providers/openai";
export type { OpenAIOptions } from "./providers/openai";
export { AnthropicProvider, AnthropicApiError } from "./providers/anthropic";
export type { AnthropicOptions } from "./providers/anthropic";

// ─── API layer ────────────────────────────────────────────────────────────────
export {
  createApp,
  buildConfigFromUrl,
  buildProviders,
  validateCampaign,
  InMemoryRateLimiter,
} from "./api/scan";
export type {
  ScanRequest,
  ScanResponse,
  CampaignRequest,
  CampaignResponse,
  AppOptions,
  RateLimiter,
} from "./api/scan";
