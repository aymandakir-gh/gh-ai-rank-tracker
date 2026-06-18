import type { AnswerEngineProvider } from "../providers";
import type { Citation, EngineResponse } from "../types";
import { fetchWithTimeout, withRetry } from "./http";

export interface GeminiOptions {
  /** Google AI API key. Defaults to process.env.GEMINI_API_KEY ?? GOOGLE_API_KEY. */
  apiKey?: string;
  /** generateContent model. Default: process.env.GEMINI_MODEL ?? "gemini-2.0-flash". */
  model?: string;
  /**
   * Enable the built-in Google Search grounding tool so answers carry real
   * citations. When false, the model answers from parametric knowledge with no
   * grounding sources. Default: true.
   */
  webSearch?: boolean;
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

// ── Internal API shape (Gemini generateContent) ───────────────────────────────

interface GeminiPart {
  text?: string;
}

interface GeminiWebChunk {
  uri?: string;
  title?: string;
}

interface GeminiGroundingChunk {
  web?: GeminiWebChunk;
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[]; role?: string };
  groundingMetadata?: { groundingChunks?: GeminiGroundingChunk[] };
}

interface GeminiResponseBody {
  candidates?: GeminiCandidate[];
}

// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const SYSTEM_INSTRUCTIONS =
  "You are a helpful research assistant. Answer the question accurately and " +
  "cite authoritative sources.";

/**
 * HTTP error from the Gemini API, carrying the status code so the shared retry
 * helper can distinguish retryable (5xx / network) from deterministic (4xx).
 */
export class GeminiApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GeminiApiError";
  }
}

/**
 * Live answer-engine provider backed by Google's Gemini generateContent API.
 *
 * Design contracts mirror the other live adapters:
 * - Requires GEMINI_API_KEY (or GOOGLE_API_KEY) via env or constructor option.
 * - Uses the built-in `google_search` grounding tool so answers carry sources.
 * - Retries transient failures (network + 5xx) with exponential backoff; never
 *   retries 4xx.
 * - Attaches the raw API payload to `EngineResponse.raw`.
 * - The injectable `fetch` option enables zero-network tests with fixtures.
 */
export class GeminiProvider implements AnswerEngineProvider {
  readonly engine = "gemini";

  private readonly apiKey: string;
  private readonly model: string;
  private readonly webSearch: boolean;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly timeoutMs?: number;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(opts: GeminiOptions = {}) {
    const key =
      opts.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
    if (!key) {
      throw new Error(
        "GeminiProvider: GEMINI_API_KEY is required. " +
          "Pass apiKey in options or set the GEMINI_API_KEY (or GOOGLE_API_KEY) env var.",
      );
    }
    this.apiKey = key;
    this.model = opts.model ?? process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
    this.webSearch = opts.webSearch ?? true;
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

  private async callApi(prompt: string): Promise<GeminiResponseBody> {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTIONS }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    };
    if (this.webSearch) {
      // Gemini 2.x grounding tool. (1.5 used `google_search_retrieval`.)
      body["tools"] = [{ google_search: {} }];
    }

    const res = await fetchWithTimeout(
      this.fetchFn,
      `${API_BASE}/${this.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      },
      this.timeoutMs,
    );

    if (!res.ok) {
      throw new GeminiApiError(
        `Gemini API responded with ${res.status} ${res.statusText}`,
        res.status,
      );
    }

    return (await res.json()) as GeminiResponseBody;
  }

  private parseResponse(prompt: string, raw: GeminiResponseBody): EngineResponse {
    const { text, citations } = extractTextAndCitations(raw);
    return { engine: this.engine, prompt, text, citations, raw };
  }
}

/** True for a bare hostname like "growthackers.io" (no spaces, real TLD). */
function looksLikeDomain(s?: string): boolean {
  if (!s) return false;
  const t = s.trim();
  return !/\s/.test(t) && /^[a-z0-9-]+(\.[a-z0-9-]+)+\.?$/i.test(t) && /\.[a-z]{2,}\.?$/i.test(t);
}

/**
 * Pull the assistant text and grounded source URLs out of a generateContent
 * payload. Text is the concatenation of the first candidate's text parts.
 *
 * Gemini grounding returns each source as `{ web: { uri, title } }`, where
 * `uri` is usually a transient Google grounding-redirect link and `title` is
 * the source's domain (e.g. "growthackers.io"). To make brand-domain citation
 * detection meaningful we prefer a domain-shaped `title` (→ `https://<title>`)
 * and fall back to the raw `uri` otherwise. URLs are deduped in first-seen order.
 *
 * Defensive against wrong-typed fields on an HTTP-200 payload — a malformed body
 * yields an empty result, never throws (parsing is outside the retry loop).
 */
export function extractTextAndCitations(raw: GeminiResponseBody): {
  text: string;
  citations: Citation[];
} {
  const candidate = Array.isArray(raw.candidates) ? raw.candidates[0] : undefined;

  const parts = Array.isArray(candidate?.content?.parts) ? candidate!.content!.parts! : [];
  let text = "";
  for (const part of parts) {
    if (typeof part.text === "string") text += part.text;
  }

  const citations: Citation[] = [];
  const seen = new Set<string>();
  const chunks = Array.isArray(candidate?.groundingMetadata?.groundingChunks)
    ? candidate!.groundingMetadata!.groundingChunks!
    : [];
  for (const chunk of chunks) {
    const web = chunk.web;
    if (!web) continue;
    const url = looksLikeDomain(web.title) ? `https://${web.title!.trim()}` : web.uri;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    citations.push(web.title ? { url, title: web.title } : { url });
  }

  return { text, citations };
}
