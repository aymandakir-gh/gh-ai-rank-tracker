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
export { demoConfig, demoProviders } from "./demo";
export { PerplexityProvider, PerplexityApiError } from "./providers/perplexity";
export type { PerplexityOptions } from "./providers/perplexity";
