import { describe, it, expect, vi, afterEach } from "vitest";
import { AnthropicProvider, AnthropicApiError } from "../src/providers/anthropic";

// ── VCR fixtures (inline — zero network I/O) ─────────────────────────────────
// Shape mirrors the Anthropic Messages API web-search response: server_tool_use
// → web_search_tool_result → a text block whose citations reference the results.

const FIXTURE_OK = {
  id: "msg_test_001",
  model: "claude-sonnet-4-6",
  role: "assistant",
  type: "message",
  content: [
    { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "geo tools" } },
    {
      type: "web_search_tool_result",
      tool_use_id: "srvtoolu_1",
      content: [
        { type: "web_search_result", url: "https://growthackers.io/", title: "GrowthHackers" },
        { type: "web_search_result", url: "https://hubspot.com/", title: "HubSpot" },
      ],
    },
    {
      type: "text",
      text: "GrowthHackers is a B2B SaaS growth marketing agency. ",
    },
    {
      type: "text",
      text: "It focuses on GEO/AEO and data-driven experimentation.",
      citations: [
        {
          type: "web_search_result_location",
          url: "https://growthackers.io/",
          title: "GrowthHackers",
          cited_text: "growth marketing agency",
        },
      ],
    },
  ],
};

// No inline citations on the text block → provider should fall back to the
// web_search_tool_result results.
const FIXTURE_FALLBACK_CITATIONS = {
  id: "msg_test_002",
  model: "claude-sonnet-4-6",
  role: "assistant",
  type: "message",
  content: [
    {
      type: "web_search_tool_result",
      tool_use_id: "srvtoolu_2",
      content: [
        { type: "web_search_result", url: "https://semrush.com/blog/geo", title: "Semrush GEO" },
      ],
    },
    { type: "text", text: "GEO is optimizing content so engines cite it." },
  ],
};

// A plain text answer with no web search at all → no citations.
const FIXTURE_TEXT_ONLY = {
  id: "msg_test_003",
  model: "claude-sonnet-4-6",
  role: "assistant",
  type: "message",
  content: [{ type: "text", text: "A direct answer with no sources." }],
};

// A failed web search: the API returns HTTP 200 with `content` as an ERROR
// OBJECT (not an array) — e.g. max_uses_exceeded / too_many_requests.
const FIXTURE_SEARCH_ERROR = {
  id: "msg_test_004",
  model: "claude-sonnet-4-6",
  role: "assistant",
  type: "message",
  content: [
    {
      type: "web_search_tool_result",
      tool_use_id: "srvtoolu_3",
      content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" },
    },
    { type: "text", text: "I couldn't complete the search, but here's what I know." },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  delete process.env["ANTHROPIC_API_KEY"];
  delete process.env["ANTHROPIC_MODEL"];
});

// ── Constructor ───────────────────────────────────────────────────────────────

describe("AnthropicProvider — constructor", () => {
  it("throws when no API key is available", () => {
    delete process.env["ANTHROPIC_API_KEY"];
    expect(() => new AnthropicProvider()).toThrow(/ANTHROPIC_API_KEY is required/);
  });

  it("accepts an apiKey option without an env var", () => {
    const p = new AnthropicProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch });
    expect(p.engine).toBe("anthropic");
  });

  it("reads ANTHROPIC_API_KEY from the environment", () => {
    process.env["ANTHROPIC_API_KEY"] = "env-key";
    expect(
      () => new AnthropicProvider({ fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch }),
    ).not.toThrow();
  });
});

// ── Response parsing ───────────────────────────────────────────────────────────

describe("AnthropicProvider — query() parsing", () => {
  it("concatenates all text blocks into the answer", async () => {
    const p = new AnthropicProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch });
    const res = await p.query("p");
    expect(res.text).toBe(
      "GrowthHackers is a B2B SaaS growth marketing agency. It focuses on GEO/AEO and data-driven experimentation.",
    );
  });

  it("extracts inline web_search_result_location citations", async () => {
    const p = new AnthropicProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch });
    const res = await p.query("p");
    expect(res.citations).toEqual([{ url: "https://growthackers.io/", title: "GrowthHackers" }]);
  });

  it("falls back to web_search_tool_result results when no inline citations", async () => {
    const p = new AnthropicProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_FALLBACK_CITATIONS) as unknown as typeof fetch });
    const res = await p.query("p");
    expect(res.citations).toEqual([{ url: "https://semrush.com/blog/geo", title: "Semrush GEO" }]);
  });

  it("returns no citations for a plain text answer", async () => {
    const p = new AnthropicProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_TEXT_ONLY) as unknown as typeof fetch });
    const res = await p.query("p");
    expect(res.text).toContain("direct answer");
    expect(res.citations).toEqual([]);
  });

  it("degrades to empty citations (no throw) when a web search returns an error block", async () => {
    const p = new AnthropicProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_SEARCH_ERROR) as unknown as typeof fetch });
    const res = await p.query("p");
    expect(res.text).toContain("couldn't complete");
    expect(res.citations).toEqual([]);
  });

  it("does NOT retry a malformed but HTTP-200 payload — parsing is deterministic", async () => {
    // Wrong-typed `content` → defensive parser yields an empty result, and the
    // single successful fetch is not retried (parse is outside the retry loop).
    const mockFetch = makeFetch({ id: "x", content: 5 });
    const p = new AnthropicProvider({ apiKey: "k", fetch: mockFetch as unknown as typeof fetch, baseDelayMs: 0 });
    const res = await p.query("p");
    expect(res.text).toBe("");
    expect(res.citations).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("attaches the raw payload and echoes engine + prompt", async () => {
    const p = new AnthropicProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch });
    const res = await p.query("my prompt");
    expect(res.engine).toBe("anthropic");
    expect(res.prompt).toBe("my prompt");
    expect((res.raw as typeof FIXTURE_OK).id).toBe("msg_test_001");
  });
});

// ── Request shape ──────────────────────────────────────────────────────────────

describe("AnthropicProvider — request shape", () => {
  it("sends x-api-key + anthropic-version headers and model + max_tokens", async () => {
    const mockFetch = makeFetch(FIXTURE_OK);
    const p = new AnthropicProvider({
      apiKey: "secret",
      model: "claude-haiku-4-5",
      maxTokens: 512,
      fetch: mockFetch as unknown as typeof fetch,
    });
    await p.query("p");
    const [, init] = mockFetch.mock.calls[0]! as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("secret");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(init.body as string) as { model: string; max_tokens: number };
    expect(body.model).toBe("claude-haiku-4-5");
    expect(body.max_tokens).toBe(512);
  });

  it("includes the web_search tool by default", async () => {
    const mockFetch = makeFetch(FIXTURE_OK);
    const p = new AnthropicProvider({ apiKey: "k", fetch: mockFetch as unknown as typeof fetch });
    await p.query("p");
    const [, init] = mockFetch.mock.calls[0]! as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { tools?: Array<{ type: string; name: string }> };
    expect(body.tools?.[0]?.name).toBe("web_search");
    expect(body.tools?.[0]?.type).toMatch(/^web_search_/);
  });

  it("omits tools when webSearch is disabled", async () => {
    const mockFetch = makeFetch(FIXTURE_TEXT_ONLY);
    const p = new AnthropicProvider({ apiKey: "k", webSearch: false, fetch: mockFetch as unknown as typeof fetch });
    await p.query("p");
    const [, init] = mockFetch.mock.calls[0]! as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { tools?: unknown[] };
    expect(body.tools).toBeUndefined();
  });
});

// ── Retry + error handling ──────────────────────────────────────────────────────

describe("AnthropicProvider — retry + errors", () => {
  it("throws AnthropicApiError on 400 without retrying", async () => {
    const mockFetch = makeFetch({ error: "bad" }, 400);
    const p = new AnthropicProvider({ apiKey: "k", fetch: mockFetch as unknown as typeof fetch, baseDelayMs: 0 });
    await expect(p.query("p")).rejects.toBeInstanceOf(AnthropicApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 529 (overloaded) and succeeds on the second attempt", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 529, statusText: "Overloaded" }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(FIXTURE_OK), {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json" },
        }),
      );
    const p = new AnthropicProvider({ apiKey: "k", fetch: mockFetch as unknown as typeof fetch, baseDelayMs: 0 });
    const res = await p.query("p");
    expect(res.text).toContain("GrowthHackers");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting maxRetries on a persistent 500", async () => {
    const mockFetch = makeFetch("", 500);
    const p = new AnthropicProvider({ apiKey: "k", fetch: mockFetch as unknown as typeof fetch, maxRetries: 2, baseDelayMs: 0 });
    await expect(p.query("p")).rejects.toBeInstanceOf(AnthropicApiError);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
