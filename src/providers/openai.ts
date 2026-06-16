import type { AnswerEngineProvider } from "../providers";
import type { Citation, EngineResponse } from "../types";
import { withRetry } from "./http";

export interface OpenAIOptions {
  /** OpenAI API key. Defaults to process.env.OPENAI_API_KEY. */
  apiKey?: string;
  /** Responses-API model. Default: process.env.OPENAI_MODEL ?? "gpt-4o". */
  model?: string;
  /**
   * Enable the built-in web_search tool so answers carry real citations.
   * When false, the model answers from parametric knowledge with no citations.
   * Default: true.
   */
  webSearch?: boolean;
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

// ── Internal API shape (OpenAI Responses API) ─────────────────────────────────

interface OpenAIAnnotation {
  type: string;
  url?: string;
  title?: string;
}

interface OpenAIContentPart {
  type: string;
  text?: string;
  annotations?: OpenAIAnnotation[];
}

interface OpenAIOutputItem {
  type: string;
  role?: string;
  content?: OpenAIContentPart[];
}

interface OpenAIResponseBody {
  id?: string;
  model?: string;
  /** Convenience aggregate some responses include; we fall back to it. */
  output_text?: string;
  output?: OpenAIOutputItem[];
}

// ─────────────────────────────────────────────────────────────────────────────

const API_URL = "https://api.openai.com/v1/responses";

const SYSTEM_INSTRUCTIONS =
  "You are a helpful research assistant. Answer the question accurately and " +
  "cite authoritative sources.";

/**
 * HTTP error from the OpenAI API, carrying the status code so the shared retry
 * helper can distinguish retryable (5xx / network) from deterministic (4xx).
 */
export class OpenAIApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "OpenAIApiError";
  }
}

/**
 * Live answer-engine provider backed by the OpenAI Responses API.
 *
 * Design contracts mirror PerplexityProvider:
 * - Requires OPENAI_API_KEY (env var or constructor option).
 * - Uses the built-in `web_search` tool so answers include URL citations.
 * - Retries transient failures (network + 5xx) with exponential backoff; never
 *   retries 4xx.
 * - Attaches the raw API payload to `EngineResponse.raw`.
 * - The injectable `fetch` option enables zero-network tests with fixtures.
 */
export class OpenAIProvider implements AnswerEngineProvider {
  readonly engine = "openai";

  private readonly apiKey: string;
  private readonly model: string;
  private readonly webSearch: boolean;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(opts: OpenAIOptions = {}) {
    const key = opts.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    if (!key) {
      throw new Error(
        "OpenAIProvider: OPENAI_API_KEY is required. " +
          "Pass apiKey in options or set the OPENAI_API_KEY env var.",
      );
    }
    this.apiKey = key;
    this.model = opts.model ?? process.env.OPENAI_MODEL ?? "gpt-4o";
    this.webSearch = opts.webSearch ?? true;
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 1000;
    this.fetchFn = opts.fetch ?? globalThis.fetch;
  }

  async query(prompt: string): Promise<EngineResponse> {
    // Retry only the network call. Parsing is deterministic — a malformed but
    // HTTP-200 payload must not be retried as if it were a transient failure.
    const raw = await withRetry(() => this.callApi(prompt), {
      maxRetries: this.maxRetries,
      baseDelayMs: this.baseDelayMs,
    });
    return this.parseResponse(prompt, raw);
  }

  private async callApi(prompt: string): Promise<OpenAIResponseBody> {
    const body: Record<string, unknown> = {
      model: this.model,
      instructions: SYSTEM_INSTRUCTIONS,
      input: prompt,
    };
    if (this.webSearch) {
      body["tools"] = [{ type: "web_search_preview" }];
    }

    const res = await this.fetchFn(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new OpenAIApiError(
        `OpenAI API responded with ${res.status} ${res.statusText}`,
        res.status,
      );
    }

    return (await res.json()) as OpenAIResponseBody;
  }

  private parseResponse(prompt: string, raw: OpenAIResponseBody): EngineResponse {
    const { text, citations } = extractTextAndCitations(raw);
    return { engine: this.engine, prompt, text, citations, raw };
  }
}

/**
 * Pull the assistant text and URL citations out of a Responses-API payload.
 * Text comes from `message` output items' `output_text` parts; citations come
 * from those parts' `url_citation` annotations, deduped by URL in first-seen
 * order. Falls back to the top-level `output_text` aggregate when present.
 */
export function extractTextAndCitations(raw: OpenAIResponseBody): {
  text: string;
  citations: Citation[];
} {
  const citations: Citation[] = [];
  const seen = new Set<string>();
  let text = "";

  // Defensive against wrong-typed fields on an HTTP-200 payload — a malformed
  // body should yield an empty result, never throw (parsing is not retried).
  const output = Array.isArray(raw.output) ? raw.output : [];
  for (const item of output) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (typeof part.text === "string") text += part.text;
      const annotations = Array.isArray(part.annotations) ? part.annotations : [];
      for (const a of annotations) {
        if (a.type === "url_citation" && a.url && !seen.has(a.url)) {
          seen.add(a.url);
          citations.push(a.title ? { url: a.url, title: a.title } : { url: a.url });
        }
      }
    }
  }

  if (!text && typeof raw.output_text === "string") text = raw.output_text;
  return { text, citations };
}
