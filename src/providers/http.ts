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

/**
 * True for an error carrying a deterministic 4xx HTTP status — retrying cannot
 * help, so it propagates immediately. 429 (Too Many Requests) is excluded: it is
 * transient and exponential backoff is exactly the right response, so it falls
 * through to the retry path instead of failing the whole engine on a blip.
 */
function isClientError(err: unknown): boolean {
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 429;
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

/** Default per-request timeout (ms) for live provider calls. */
export const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Thrown when a live provider request exceeds its timeout. Carries no `status`,
 * so {@link withRetry} treats it as a transient failure and retries it — which
 * bounds total wall-clock to (timeout + backoff) × attempts instead of hanging
 * forever on an upstream that accepts the connection but never responds.
 */
export class HttpTimeoutError extends Error {
  constructor(
    public readonly timeoutMs: number,
    public readonly url: string,
  ) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = "HttpTimeoutError";
  }
}

/**
 * `fetch` with an AbortController-based timeout. Without this a hung upstream
 * (TCP connected, no response) stalls a scan indefinitely — `withRetry` can't
 * help because a hang never throws. A non-positive / non-finite `timeoutMs`
 * disables the timeout. The injected `fetchFn` is used as-is so VCR-style test
 * fetches keep working; a real abort surfaces as {@link HttpTimeoutError}.
 */
export async function fetchWithTimeout(
  fetchFn: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetchFn(url, init);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) throw new HttpTimeoutError(timeoutMs, url);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
