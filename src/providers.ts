import type { Citation, EngineResponse } from "./types";

/**
 * Pluggable answer-engine provider. Real adapters (Perplexity, OpenAI, Gemini,
 * Google AI Overviews) implement this same interface; v0.1 ships the
 * deterministic MockProvider so the engine is fully testable offline.
 */
export interface AnswerEngineProvider {
  /** Stable engine id, e.g. "mock", "perplexity", "chatgpt". */
  readonly engine: string;
  /** Query the engine with a prompt and return a normalized response. */
  query(prompt: string): Promise<EngineResponse>;
}

/** A scripted answer used by MockProvider. */
export interface MockAnswer {
  text: string;
  citations?: Citation[];
}

export interface MockProviderOptions {
  /** Engine id reported on responses (default "mock"). */
  engine?: string;
  /** Map of exact prompt -> scripted answer. */
  script?: Record<string, MockAnswer>;
  /** Answer used for prompts not present in `script`. */
  fallback?: MockAnswer;
}

/**
 * Deterministic provider for tests, demos and offline runs.
 * Never performs a network call — it returns scripted answers only.
 */
export class MockProvider implements AnswerEngineProvider {
  readonly engine: string;
  private readonly script: Record<string, MockAnswer>;
  private readonly fallback: MockAnswer;

  constructor(opts: MockProviderOptions = {}) {
    this.engine = opts.engine ?? "mock";
    this.script = opts.script ?? {};
    this.fallback = opts.fallback ?? { text: "", citations: [] };
  }

  async query(prompt: string): Promise<EngineResponse> {
    const answer = this.script[prompt] ?? this.fallback;
    return {
      engine: this.engine,
      prompt,
      text: answer.text ?? "",
      citations: answer.citations ?? [],
    };
  }
}
