/**
 * Shared HTTP plumbing for the live answer-engine adapters.
 *
 * Every live provider (Perplexity, OpenAI, Anthropic) talks to a JSON HTTP API
 * with the same resilience contract:
 *   - retry transient failures (network errors + 5xx) with exponential backoff
 *   - never retry deterministic client errors (4xx)
 *
 * The retry helper is duck-typed on a numeric `status` field so each provider
 * keeps its own typed error class (PerplexityApiError, OpenAIApiError, …) while
 * sharing one backoff implementation.
 */

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface RetryOptions {
  /** Max additional attempts after the first failure (so attempts = maxRetries + 1). */
  maxRetries: number;
  /** Base delay in ms for exponential backoff (1 s → 2 s → 4 s with the default). */
  baseDelayMs: number;
}

/** True for an error carrying an HTTP status in the 4xx range (deterministic — don't retry). */
function isClientError(err: unknown): boolean {
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" && status >= 400 && status < 500;
}

/**
 * Run `attempt` with exponential backoff. Retries on any thrown error except a
 * 4xx (those are deterministic — retrying cannot help and the error propagates
 * immediately). Re-throws the last error once `maxRetries` is exhausted.
 */
export async function withRetry<T>(
  attempt: () => Promise<T>,
  { maxRetries, baseDelayMs }: RetryOptions,
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i <= maxRetries; i++) {
    if (i > 0) await sleep(baseDelayMs * Math.pow(2, i - 1));
    try {
      return await attempt();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (isClientError(err)) throw err;
    }
  }
  throw lastError ?? new Error("withRetry: max retries exhausted");
}
