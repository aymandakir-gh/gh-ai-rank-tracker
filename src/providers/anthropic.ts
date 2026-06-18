import type { AnswerEngineProvider } from "../providers";
import type { Citation, EngineResponse } from "../types";
import { fetchWithTimeout, withRetry } from "./http";

export interface AnthropicOptions {
  /** Anthropic API key. Defaults to process.env.ANTHROPIC_API_KEY. */
  apiKey?: string;
  /** Messages-API model. Default: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6". */
  model?: string;
  /** Max output tokens for the answer. Default: 1024. */
  maxTokens?: number;
  /**
   * Enable the server-side web_search tool so answers carry real citations.
   * When false, the model answers from parametric knowledge with no citations.
   * Default: true.
   */
  webSearch?: boolean;
  /** Max web_search rounds the model may run per query. Default: 5. */
  maxSearchUses?: number;
  /** Max additional attempts after the first failure. Default: 3 (4 attempts total). */
  maxRetries?: number;
  /** Base delay ms for exponential backoff (1 s → 2 s → 4 s). Default: 1000. */
  baseDelayMs?: number;
  /** Per-request timeout in ms (AbortController). Default: 60_000. Set <=0 to disable. */
  timeoutMs?: number;
  /**
   * Injectable fetch for VCR-style testing.
   * When provided, the provider never makes a real HTTP call.
   * Default: globalThis.fetch (Node 20+).
   */
  fetch?: typeof globalThis.fetch;
}

// ── Internal API shape (Anthropic Messages API) ───────────────────────────────

interface AnthropicCitation {
  type: string;
  url?: string;
  title?: string;
}

interface AnthropicWebSearchResult {
  type: string;
  url?: string;
  title?: string;
}

interface AnthropicContentBlock {
  type: string;
  /** Present on "text" blocks. */
  text?: string;
  /** Present on "text" blocks that reference web-search sources. */
  citations?: AnthropicCitation[];
  /** Present on "web_search_tool_result" blocks. */
  content?: AnthropicWebSearchResult[];
}

interface AnthropicResponseBody {
  id?: string;
  model?: string;
  role?: string;
  type?: string;
  content?: AnthropicContentBlock[];
}

// ─────────────────────────────────────────────────────────────────────────────

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const WEB_SEARCH_TOOL = "web_search_20260209";

const SYSTEM_PROMPT =
  "You are a helpful research assistant. Answer the question accurately and " +
  "cite authoritative sources.";

/**
 * HTTP error from the Anthropic API, carrying the status code so the shared
 * retry helper can distinguish retryable (5xx / network) from deterministic (4xx).
 */
export class AnthropicApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AnthropicApiError";
  }
}

/**
 * Live answer-engine provider backed by the Anthropic Messages API.
 *
 * Design contracts mirror PerplexityProvider:
 * - Requires ANTHROPIC_API_KEY (env var or constructor option).
 * - Uses the server-side `web_search` tool so answers include URL citations.
 * - Retries transient failures (network + 5xx) with exponential backoff; never
 *   retries 4xx.
 * - Attaches the raw API payload to `EngineResponse.raw`.
 * - The injectable `fetch` option enables zero-network tests with fixtures.
 */
export class AnthropicProvider implements AnswerEngineProvider {
  readonly engine = "anthropic";

  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly webSearch: boolean;
  private readonly maxSearchUses: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly timeoutMs?: number;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(opts: AnthropicOptions = {}) {
    const key = opts.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    if (!key) {
      throw new Error(
        "AnthropicProvider: ANTHROPIC_API_KEY is required. " +
          "Pass apiKey in options or set the ANTHROPIC_API_KEY env var.",
      );
    }
    this.apiKey = key;
    this.model = opts.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
    this.maxTokens = opts.maxTokens ?? 1024;
    this.webSearch = opts.webSearch ?? true;
    this.maxSearchUses = opts.maxSearchUses ?? 5;
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 1000;
    this.timeoutMs = opts.timeoutMs;
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

  private async callApi(prompt: string): Promise<AnthropicResponseBody> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    };
    if (this.webSearch) {
      body["tools"] = [
        { type: WEB_SEARCH_TOOL, name: "web_search", max_uses: this.maxSearchUses },
      ];
    }

    const res = await fetchWithTimeout(
      this.fetchFn,
      API_URL,
      {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      },
      this.timeoutMs,
    );

    if (!res.ok) {
      throw new AnthropicApiError(
        `Anthropic API responded with ${res.status} ${res.statusText}`,
        res.status,
      );
    }

    return (await res.json()) as AnthropicResponseBody;
  }

  private parseResponse(prompt: string, raw: AnthropicResponseBody): EngineResponse {
    const { text, citations } = extractTextAndCitations(raw);
    return { engine: this.engine, prompt, text, citations, raw };
  }
}

/**
 * Pull the assistant text and cited source URLs out of a Messages-API payload.
 * Text is the concatenation of all `text` blocks. Citations are the inline
 * `web_search_result_location` references the model attached to its text; if
 * none are present we fall back to the raw `web_search_tool_result` results.
 * Either way URLs are deduped in first-seen order.
 */
export function extractTextAndCitations(raw: AnthropicResponseBody): {
  text: string;
  citations: Citation[];
} {
  // Defensive against wrong-typed fields on an HTTP-200 payload — a malformed
  // body should yield an empty result, never throw (parsing is not retried).
  const blocks = Array.isArray(raw.content) ? raw.content : [];
  let text = "";
  const citations: Citation[] = [];
  const seen = new Set<string>();

  const add = (url?: string, title?: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    citations.push(title ? { url, title } : { url });
  };

  for (const block of blocks) {
    if (block.type === "text") {
      if (typeof block.text === "string") text += block.text;
      const cits = Array.isArray(block.citations) ? block.citations : [];
      for (const c of cits) add(c.url, c.title);
    }
  }

  // Fall back to the raw search results when the model didn't inline citations.
  // On a failed search the API returns `content` as an error OBJECT (HTTP 200,
  // e.g. { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" }),
  // not an array — so guard with Array.isArray before iterating.
  if (citations.length === 0) {
    for (const block of blocks) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) add(r.url, r.title);
      }
    }
  }

  return { text, citations };
}
