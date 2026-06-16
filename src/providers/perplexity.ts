import type { AnswerEngineProvider } from "../providers";
import type { Citation, EngineResponse } from "../types";
import { withRetry } from "./http";

export interface PerplexityOptions {
  /** Perplexity API key. Defaults to process.env.PERPLEXITY_API_KEY. */
  apiKey?: string;
  /** Perplexity chat model. Default: "llama-3.1-sonar-large-128k-online". */
  model?: string;
  /** Max additional attempts after the first failure. Default: 3 (4 attempts total). */
  maxRetries?: number;
  /** Base delay ms for exponential backoff (1 s → 2 s → 4 s). Default: 1000. */
  baseDelayMs?: number;
  /**
   * Injectable fetch for VCR-style testing.
   * When provided, the provider never makes a real HTTP call.
   * Default: globalThis.fetch (Node 20+).
   */
  fetch?: typeof globalThis.fetch;
}

// ── Internal API shape ────────────────────────────────────────────────────────

interface PerplexityMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface PerplexityChoice {
  index: number;
  finish_reason?: string;
  message: { role: string; content: string };
}

interface PerplexityResponseBody {
  id: string;
  model: string;
  object: string;
  created: number;
  choices: PerplexityChoice[];
  /** URL strings returned by the sonar-online family of models. */
  citations?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────

const API_URL = "https://api.perplexity.ai/chat/completions";

/**
 * HTTP error from the Perplexity API, carrying the status code so callers
 * can decide whether to retry (5xx) or propagate immediately (4xx).
 */
export class PerplexityApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "PerplexityApiError";
  }
}

/**
 * Live answer-engine provider backed by the Perplexity AI chat completions API.
 *
 * Design contracts:
 * - Requires PERPLEXITY_API_KEY (env var or constructor option).
 * - Retries transient failures (network errors + 5xx) with exponential backoff.
 * - Does NOT retry client errors (4xx) — they indicate deterministic failures.
 * - Attaches the raw API payload to `EngineResponse.raw` for auditing/debugging.
 * - The injectable `fetch` option enables zero-network tests with fixture data.
 */
export class PerplexityProvider implements AnswerEngineProvider {
  readonly engine = "perplexity";

  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(opts: PerplexityOptions = {}) {
    const key = opts.apiKey ?? process.env.PERPLEXITY_API_KEY ?? "";
    if (!key) {
      throw new Error(
        "PerplexityProvider: PERPLEXITY_API_KEY is required. " +
          "Pass apiKey in options or set the PERPLEXITY_API_KEY env var.",
      );
    }
    this.apiKey = key;
    this.model = opts.model ?? process.env.PERPLEXITY_MODEL ?? "sonar";
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 1000;
    this.fetchFn = opts.fetch ?? globalThis.fetch;
  }

  async query(prompt: string): Promise<EngineResponse> {
    return withRetry(async () => this.parseResponse(prompt, await this.callApi(prompt)), {
      maxRetries: this.maxRetries,
      baseDelayMs: this.baseDelayMs,
    });
  }

  private async callApi(prompt: string): Promise<PerplexityResponseBody> {
    const messages: PerplexityMessage[] = [
      {
        role: "system",
        content:
          "You are a helpful assistant. Provide accurate, informative answers with sources.",
      },
      { role: "user", content: prompt },
    ];

    const res = await this.fetchFn(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        return_citations: true,
        return_images: false,
      }),
    });

    if (!res.ok) {
      throw new PerplexityApiError(
        `Perplexity API responded with ${res.status} ${res.statusText}`,
        res.status,
      );
    }

    return (await res.json()) as PerplexityResponseBody;
  }

  private parseResponse(prompt: string, raw: PerplexityResponseBody): EngineResponse {
    const text = raw.choices?.[0]?.message?.content ?? "";
    const citations: Citation[] = (raw.citations ?? []).map((url) => ({ url }));
    return { engine: this.engine, prompt, text, citations, raw };
  }
}
