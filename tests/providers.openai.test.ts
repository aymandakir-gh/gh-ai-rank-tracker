import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenAIProvider, OpenAIApiError } from "../src/providers/openai";

// ── VCR fixtures (inline — zero network I/O) ─────────────────────────────────
// Shape mirrors the OpenAI Responses API: an `output` array with a web_search
// call followed by a message whose output_text parts carry url_citation
// annotations.

const FIXTURE_OK = {
  id: "resp_test_001",
  model: "gpt-4o",
  output: [
    { type: "web_search_call", id: "ws_1", status: "completed" },
    {
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text:
            "GrowthHackers is a B2B SaaS growth marketing agency focused on " +
            "data-driven experimentation and GEO/AEO.",
          annotations: [
            { type: "url_citation", url: "https://growthackers.io/", title: "GrowthHackers" },
            { type: "url_citation", url: "https://growthackers.io/blog/geo", title: "GEO guide" },
          ],
        },
      ],
    },
  ],
};

const FIXTURE_NO_CITATIONS = {
  id: "resp_test_002",
  model: "gpt-4o",
  output: [
    {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "A general answer with no sources.", annotations: [] }],
    },
  ],
};

// A duplicate URL across annotations — should be deduped to one citation.
const FIXTURE_DUP_CITATIONS = {
  id: "resp_test_003",
  model: "gpt-4o",
  output: [
    {
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "Repeated source.",
          annotations: [
            { type: "url_citation", url: "https://example.com/x", title: "X" },
            { type: "url_citation", url: "https://example.com/x", title: "X again" },
          ],
        },
      ],
    },
  ],
};

// Only the top-level output_text aggregate, no message output items.
const FIXTURE_OUTPUT_TEXT_ONLY = {
  id: "resp_test_004",
  model: "gpt-4o",
  output_text: "Answer surfaced only via the output_text aggregate.",
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
  delete process.env["OPENAI_API_KEY"];
  delete process.env["OPENAI_MODEL"];
});

// ── Constructor ───────────────────────────────────────────────────────────────

describe("OpenAIProvider — constructor", () => {
  it("throws when no API key is available", () => {
    delete process.env["OPENAI_API_KEY"];
    expect(() => new OpenAIProvider()).toThrow(/OPENAI_API_KEY is required/);
  });

  it("accepts an apiKey option without an env var", () => {
    const p = new OpenAIProvider({
      apiKey: "k",
      fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch,
    });
    expect(p.engine).toBe("openai");
  });

  it("reads OPENAI_API_KEY from the environment", () => {
    process.env["OPENAI_API_KEY"] = "env-key";
    expect(
      () => new OpenAIProvider({ fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch }),
    ).not.toThrow();
  });
});

// ── Response parsing ───────────────────────────────────────────────────────────

describe("OpenAIProvider — query() parsing", () => {
  it("extracts assistant text from the message output", async () => {
    const p = new OpenAIProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch });
    const res = await p.query("best growth agencies");
    expect(res.text).toContain("GrowthHackers");
  });

  it("normalizes url_citation annotations into Citation objects", async () => {
    const p = new OpenAIProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch });
    const res = await p.query("p");
    expect(res.citations).toEqual([
      { url: "https://growthackers.io/", title: "GrowthHackers" },
      { url: "https://growthackers.io/blog/geo", title: "GEO guide" },
    ]);
  });

  it("dedupes repeated citation URLs (first title wins)", async () => {
    const p = new OpenAIProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_DUP_CITATIONS) as unknown as typeof fetch });
    const res = await p.query("p");
    expect(res.citations).toEqual([{ url: "https://example.com/x", title: "X" }]);
  });

  it("returns an empty citations array when there are no annotations", async () => {
    const p = new OpenAIProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_NO_CITATIONS) as unknown as typeof fetch });
    const res = await p.query("p");
    expect(res.citations).toEqual([]);
  });

  it("falls back to the output_text aggregate when no message parts exist", async () => {
    const p = new OpenAIProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_OUTPUT_TEXT_ONLY) as unknown as typeof fetch });
    const res = await p.query("p");
    expect(res.text).toContain("output_text aggregate");
  });

  it("attaches the raw payload and echoes engine + prompt", async () => {
    const p = new OpenAIProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch });
    const res = await p.query("my prompt");
    expect(res.engine).toBe("openai");
    expect(res.prompt).toBe("my prompt");
    expect((res.raw as typeof FIXTURE_OK).id).toBe("resp_test_001");
  });
});

// ── Request shape ──────────────────────────────────────────────────────────────

describe("OpenAIProvider — request shape", () => {
  it("sends a Bearer Authorization header and the configured model", async () => {
    const mockFetch = makeFetch(FIXTURE_OK);
    const p = new OpenAIProvider({
      apiKey: "secret",
      model: "gpt-4o-mini",
      fetch: mockFetch as unknown as typeof fetch,
    });
    await p.query("p");
    const [, init] = mockFetch.mock.calls[0]! as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer secret");
    const body = JSON.parse(init.body as string) as { model: string; tools?: unknown[] };
    expect(body.model).toBe("gpt-4o-mini");
  });

  it("includes the web_search tool by default", async () => {
    const mockFetch = makeFetch(FIXTURE_OK);
    const p = new OpenAIProvider({ apiKey: "k", fetch: mockFetch as unknown as typeof fetch });
    await p.query("p");
    const [, init] = mockFetch.mock.calls[0]! as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { tools?: Array<{ type: string }> };
    expect(body.tools?.[0]?.type).toBe("web_search_preview");
  });

  it("omits tools when webSearch is disabled", async () => {
    const mockFetch = makeFetch(FIXTURE_OK);
    const p = new OpenAIProvider({ apiKey: "k", webSearch: false, fetch: mockFetch as unknown as typeof fetch });
    await p.query("p");
    const [, init] = mockFetch.mock.calls[0]! as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { tools?: unknown[] };
    expect(body.tools).toBeUndefined();
  });
});

// ── Retry + error handling ──────────────────────────────────────────────────────

describe("OpenAIProvider — retry + errors", () => {
  it("throws OpenAIApiError on 401 without retrying", async () => {
    const mockFetch = makeFetch({ error: "unauthorized" }, 401);
    const p = new OpenAIProvider({ apiKey: "k", fetch: mockFetch as unknown as typeof fetch, baseDelayMs: 0 });
    await expect(p.query("p")).rejects.toBeInstanceOf(OpenAIApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 500 and succeeds on the second attempt", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 500, statusText: "ISE" }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(FIXTURE_OK), {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json" },
        }),
      );
    const p = new OpenAIProvider({ apiKey: "k", fetch: mockFetch as unknown as typeof fetch, baseDelayMs: 0 });
    const res = await p.query("p");
    expect(res.text).toContain("GrowthHackers");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting maxRetries on a persistent 500", async () => {
    const mockFetch = makeFetch("", 500);
    const p = new OpenAIProvider({ apiKey: "k", fetch: mockFetch as unknown as typeof fetch, maxRetries: 2, baseDelayMs: 0 });
    await expect(p.query("p")).rejects.toBeInstanceOf(OpenAIApiError);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry a malformed but HTTP-200 payload — parsing is deterministic", async () => {
    // Wrong-typed `output` → defensive parser yields an empty result, and the
    // single successful fetch is not retried (parse is outside the retry loop).
    const mockFetch = makeFetch({ id: "x", output: 5 });
    const p = new OpenAIProvider({ apiKey: "k", fetch: mockFetch as unknown as typeof fetch, baseDelayMs: 0 });
    const res = await p.query("p");
    expect(res.text).toBe("");
    expect(res.citations).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
