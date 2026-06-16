/**
 * Live integration tests for the answer-engine adapters.
 *
 * These make REAL, billable network calls and are therefore SKIPPED unless the
 * matching API key is present in the environment. With no keys set (CI default,
 * fresh clone) the whole file is skipped and the suite stays green. To run one:
 *
 *   OPENAI_API_KEY=sk-...     npx vitest run tests/providers.integration.test.ts
 *   ANTHROPIC_API_KEY=sk-...  npx vitest run tests/providers.integration.test.ts
 *   PERPLEXITY_API_KEY=pplx-... npx vitest run tests/providers.integration.test.ts
 *
 * They assert only the provider contract (non-empty text, citations array,
 * echoed engine/prompt) — not specific content, which is non-deterministic.
 */
import { describe, it, expect } from "vitest";
import type { AnswerEngineProvider } from "../src/providers";
import { PerplexityProvider } from "../src/providers/perplexity";
import { OpenAIProvider } from "../src/providers/openai";
import { AnthropicProvider } from "../src/providers/anthropic";

const PROMPT = "What is generative engine optimization (GEO)? Name a couple of tools.";
const TIMEOUT_MS = 90_000;

function liveSuite(engine: string, envVar: string, make: () => AnswerEngineProvider) {
  const hasKey = Boolean(process.env[envVar]);
  describe.skipIf(!hasKey)(`${engine} live integration (requires ${envVar})`, () => {
    it(
      "returns a non-empty answer and a citations array for a real prompt",
      async () => {
        const provider = make();
        const res = await provider.query(PROMPT);
        expect(res.engine).toBe(engine);
        expect(res.prompt).toBe(PROMPT);
        expect(typeof res.text).toBe("string");
        expect(res.text.length).toBeGreaterThan(0);
        expect(Array.isArray(res.citations)).toBe(true);
        // Every citation, if any, must carry a usable URL.
        for (const c of res.citations) {
          expect(typeof c.url).toBe("string");
          expect(c.url.length).toBeGreaterThan(0);
        }
      },
      TIMEOUT_MS,
    );
  });
}

liveSuite("perplexity", "PERPLEXITY_API_KEY", () => new PerplexityProvider());
liveSuite("openai", "OPENAI_API_KEY", () => new OpenAIProvider());
liveSuite("anthropic", "ANTHROPIC_API_KEY", () => new AnthropicProvider());
