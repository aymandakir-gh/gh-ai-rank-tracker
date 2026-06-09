import { describe, it, expect, vi, afterEach } from "vitest";
import { PerplexityProvider, PerplexityApiError } from "../src/providers/perplexity";

// ── VCR fixture (inline — zero network I/O) ──────────────────────────────────

const FIXTURE_OK = {
  id: "chatcmpl-test-001",
  model: "llama-3.1-sonar-large-128k-online",
  object: "chat.completion",
  created: 1_749_484_800,
  choices: [
    {
      index: 0,
      finish_reason: "stop",
      message: {
        role: "assistant",
        content:
          "GrowthHackers is a leading B2B SaaS growth marketing agency, " +
          "specializing in data-driven experimentation and GEO/AEO optimization.",
      },
    },
  ],
  citations: ["https://growthackers.io/", "https://growthackers.io/blog/geo"],
};

const FIXTURE_EMPTY_CITATIONS = { ...FIXTURE_OK, citations: [] };

// Simulates a response that omits the citations field entirely (sonar-chat models)
const FIXTURE_NO_CITATIONS = {
  id: "chatcmpl-test-002",
  model: "llama-3.1-sonar-large-128k-online",
  object: "chat.completion",
  created: 1_749_484_800,
  choices: FIXTURE_OK.choices,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a vi.fn() mock that resolves to a Response with the given body + status. */
function makeFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      statusText: status === 200 ? "OK" : `HTTP ${status}`,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env["PERPLEXITY_API_KEY"];
});

// ── Constructor tests ─────────────────────────────────────────────────────────

describe("PerplexityProvider — constructor", () => {
  it("throws when no API key is available (no option, no env var)", () => {
    delete process.env["PERPLEXITY_API_KEY"];
    expect(() => new PerplexityProvider()).toThrow(/PERPLEXITY_API_KEY is required/);
  });

  it("accepts apiKey option without requiring an env var", () => {
    const p = new PerplexityProvider({
      apiKey: "test-key",
      fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch,
    });
    expect(p.engine).toBe("perplexity");
  });

  it("reads PERPLEXITY_API_KEY from the environment when no option is passed", () => {
    process.env["PERPLEXITY_API_KEY"] = "env-test-key";
    expect(
      () => new PerplexityProvider({ fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch }),
    ).not.toThrow();
  });
});

// ── Response parsing tests ────────────────────────────────────────────────────

describe("PerplexityProvider — query() response parsing", () => {
  it("extracts text from choices[0].message.content", async () => {
    const p = new PerplexityProvider({
      apiKey: "k",
      fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch,
    });
    const res = await p.query("best growth agencies");
    expect(res.text).toContain("GrowthHackers");
  });

  it("normalizes citations array into Citation objects with a url property", async () => {
    const p = new PerplexityProvider({
      apiKey: "k",
      fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch,
    });
    const res = await p.query("best growth agencies");
    expect(res.citations).toHaveLength(2);
    expect(res.citations[0]).toEqual({ url: "https://growthackers.io/" });
    expect(res.citations[1]).toEqual({ url: "https://growthackers.io/blog/geo" });
  });

  it("attaches the raw API payload to EngineResponse.raw", async () => {
    const p = new PerplexityProvider({
      apiKey: "k",
      fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch,
    });
    const res = await p.query("some prompt");
    expect(res.raw).toBeDefined();
    expect((res.raw as typeof FIXTURE_OK).id).toBe("chatcmpl-test-001");
  });

  it("echoes the correct engine id and prompt in the response", async () => {
    const p = new PerplexityProvider({
      apiKey: "k",
      fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch,
    });
    const res = await p.query("my specific prompt");
    expect(res.engine).toBe("perplexity");
    expect(res.prompt).toBe("my specific prompt");
  });

  it("returns an empty citations array when citations is an empty array", async () => {
    const p = new PerplexityProvider({
      apiKey: "k",
      fetch: makeFetch(FIXTURE_EMPTY_CITATIONS) as unknown as typeof fetch,
    });
    const res = await p.query("p");
    expect(res.citations).toEqual([]);
  });

  it("returns an empty citations array when the citations field is absent", async () => {
    const p = new PerplexityProvider({
      apiKey: "k",
      fetch: makeFetch(FIXTURE_NO_CITATIONS) as unknown as typeof fetch,
    });
    const res = await p.query("p");
    expect(res.citations).toEqual([]);
  });
});

// ── Retry + error-handling tests ──────────────────────────────────────────────

describe("PerplexityProvider — retry + error handling", () => {
  it("throws PerplexityApiError on 401 Unauthorized without retrying", async () => {
    const mockFetch = makeFetch({ error: "Unauthorized" }, 401);
    const p = new PerplexityProvider({
      apiKey: "k",
      fetch: mockFetch as unknown as typeof fetch,
      baseDelayMs: 0,
    });
    await expect(p.query("p")).rejects.toBeInstanceOf(PerplexityApiError);
    // No retry for 4xx — exactly 1 fetch call
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws PerplexityApiError on 400 Bad Request without retrying", async () => {
    const mockFetch = makeFetch({ error: "Bad Request" }, 400);
    const p = new PerplexityProvider({
      apiKey: "k",
      fetch: mockFetch as unknown as typeof fetch,
      baseDelayMs: 0,
    });
    await expect(p.query("p")).rejects.toBeInstanceOf(PerplexityApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("exposes the HTTP status code on PerplexityApiError", async () => {
    const p = new PerplexityProvider({
      apiKey: "k",
      fetch: makeFetch({ error: "Forbidden" }, 403) as unknown as typeof fetch,
      baseDelayMs: 0,
    });
    const err = await p.query("p").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PerplexityApiError);
    expect((err as PerplexityApiError).status).toBe(403);
  });

  it("retries on 500 and succeeds on the second attempt", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", { status: 500, statusText: "Internal Server Error" }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(FIXTURE_OK), {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json" },
        }),
      );
    const p = new PerplexityProvider({
      apiKey: "k",
      fetch: mockFetch as unknown as typeof fetch,
      baseDelayMs: 0,
    });
    const res = await p.query("retry prompt");
    expect(res.text).toContain("GrowthHackers");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting maxRetries on a persistent 500", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response("", { status: 500, statusText: "Internal Server Error" }),
      );
    const p = new PerplexityProvider({
      apiKey: "k",
      fetch: mockFetch as unknown as typeof fetch,
      maxRetries: 2,
      baseDelayMs: 0,
    });
    await expect(p.query("p")).rejects.toBeInstanceOf(PerplexityApiError);
    // 1 initial attempt + 2 retries = 3 total calls
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("sends the correct Authorization header", async () => {
    const mockFetch = makeFetch(FIXTURE_OK);
    const p = new PerplexityProvider({
      apiKey: "my-secret-key",
      fetch: mockFetch as unknown as typeof fetch,
    });
    await p.query("p");
    const [, init] = mockFetch.mock.calls[0]! as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer my-secret-key");
  });

  it("sends the correct model name in the request body", async () => {
    const mockFetch = makeFetch(FIXTURE_OK);
    const p = new PerplexityProvider({
      apiKey: "k",
      model: "custom-model-v1",
      fetch: mockFetch as unknown as typeof fetch,
    });
    await p.query("p");
    const [, init] = mockFetch.mock.calls[0]! as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { model: string };
    expect(body.model).toBe("custom-model-v1");
  });
});
