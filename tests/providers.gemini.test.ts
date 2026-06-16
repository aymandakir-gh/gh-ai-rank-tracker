import { describe, it, expect, vi, afterEach } from "vitest";
import { GeminiProvider, GeminiApiError, extractTextAndCitations } from "../src/providers/gemini";

// ── VCR fixtures (inline — zero network I/O) ─────────────────────────────────
// Shape mirrors the Gemini generateContent API: a `candidates` array whose first
// candidate has content.parts (text) and groundingMetadata.groundingChunks
// (sources). Grounding `web.title` typically holds the source domain; `web.uri`
// is a transient Google grounding-redirect link.

const FIXTURE_OK = {
  candidates: [
    {
      content: {
        role: "model",
        parts: [
          { text: "GrowthHackers is a data-driven B2B SaaS growth agency " },
          { text: "focused on GEO/AEO." },
        ],
      },
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "growthackers.io" } },
          { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/def", title: "hubspot.com" } },
        ],
      },
    },
  ],
};

const FIXTURE_NO_GROUNDING = {
  candidates: [
    { content: { role: "model", parts: [{ text: "A general answer with no sources." }] } },
  ],
};

// Two chunks that resolve to the same domain-shaped title → deduped to one.
const FIXTURE_DUP = {
  candidates: [
    {
      content: { parts: [{ text: "Repeated source." }] },
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: "https://redirect/1", title: "example.com" } },
          { web: { uri: "https://redirect/2", title: "example.com" } },
        ],
      },
    },
  ],
};

// A grounding chunk whose title is a page title (not a domain) → fall back to uri.
const FIXTURE_TITLE_NOT_DOMAIN = {
  candidates: [
    {
      content: { parts: [{ text: "Titled source." }] },
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: "https://realsite.example/page", title: "A Great Article About Widgets" } },
        ],
      },
    },
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
  delete process.env["GEMINI_API_KEY"];
  delete process.env["GOOGLE_API_KEY"];
  delete process.env["GEMINI_MODEL"];
});

// ── Constructor ───────────────────────────────────────────────────────────────

describe("GeminiProvider — constructor", () => {
  it("throws when no API key is available", () => {
    delete process.env["GEMINI_API_KEY"];
    delete process.env["GOOGLE_API_KEY"];
    expect(() => new GeminiProvider()).toThrow(/GEMINI_API_KEY is required/);
  });

  it("accepts an apiKey option without an env var", () => {
    const p = new GeminiProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch });
    expect(p.engine).toBe("gemini");
  });

  it("reads GEMINI_API_KEY then falls back to GOOGLE_API_KEY", () => {
    process.env["GOOGLE_API_KEY"] = "google-key";
    expect(
      () => new GeminiProvider({ fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch }),
    ).not.toThrow();
  });
});

// ── Response parsing ───────────────────────────────────────────────────────────

describe("GeminiProvider — query() parsing", () => {
  it("concatenates text parts from the first candidate", async () => {
    const p = new GeminiProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch });
    const res = await p.query("best growth agencies");
    expect(res.text).toBe("GrowthHackers is a data-driven B2B SaaS growth agency focused on GEO/AEO.");
  });

  it("maps domain-shaped grounding titles to https://<domain> citations", async () => {
    const p = new GeminiProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch });
    const res = await p.query("p");
    expect(res.citations).toEqual([
      { url: "https://growthackers.io", title: "growthackers.io" },
      { url: "https://hubspot.com", title: "hubspot.com" },
    ]);
  });

  it("dedupes grounding chunks that resolve to the same URL", async () => {
    const p = new GeminiProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_DUP) as unknown as typeof fetch });
    const res = await p.query("p");
    expect(res.citations).toEqual([{ url: "https://example.com", title: "example.com" }]);
  });

  it("falls back to the raw uri when the title is not domain-shaped", async () => {
    const p = new GeminiProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_TITLE_NOT_DOMAIN) as unknown as typeof fetch });
    const res = await p.query("p");
    expect(res.citations).toEqual([
      { url: "https://realsite.example/page", title: "A Great Article About Widgets" },
    ]);
  });

  it("returns an empty citations array when there is no grounding metadata", async () => {
    const p = new GeminiProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_NO_GROUNDING) as unknown as typeof fetch });
    const res = await p.query("p");
    expect(res.citations).toEqual([]);
    expect(res.text).toContain("no sources");
  });

  it("attaches the raw payload and echoes engine + prompt", async () => {
    const p = new GeminiProvider({ apiKey: "k", fetch: makeFetch(FIXTURE_OK) as unknown as typeof fetch });
    const res = await p.query("my prompt");
    expect(res.engine).toBe("gemini");
    expect(res.prompt).toBe("my prompt");
    expect((res.raw as typeof FIXTURE_OK).candidates[0]!.content.role).toBe("model");
  });
});

// ── extractTextAndCitations (defensive) ─────────────────────────────────────────

describe("extractTextAndCitations — defensive parsing", () => {
  it("returns empty values for a wrong-typed body (never throws)", () => {
    expect(extractTextAndCitations({ candidates: 5 } as never)).toEqual({ text: "", citations: [] });
    expect(extractTextAndCitations({} as never)).toEqual({ text: "", citations: [] });
  });

  it("ignores grounding chunks with no web object", () => {
    const out = extractTextAndCitations({
      candidates: [
        {
          content: { parts: [{ text: "x" }] },
          groundingMetadata: { groundingChunks: [{}, { web: { uri: "https://a.example/x" } }] },
        },
      ],
    } as never);
    expect(out.citations).toEqual([{ url: "https://a.example/x" }]);
  });
});

// ── Request shape ──────────────────────────────────────────────────────────────

describe("GeminiProvider — request shape", () => {
  it("sends the x-goog-api-key header and targets the configured model", async () => {
    const mockFetch = makeFetch(FIXTURE_OK);
    const p = new GeminiProvider({ apiKey: "secret", model: "gemini-1.5-pro", fetch: mockFetch as unknown as typeof fetch });
    await p.query("p");
    const [url, init] = mockFetch.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain("/models/gemini-1.5-pro:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret");
  });

  it("includes the google_search grounding tool by default", async () => {
    const mockFetch = makeFetch(FIXTURE_OK);
    const p = new GeminiProvider({ apiKey: "k", fetch: mockFetch as unknown as typeof fetch });
    await p.query("p");
    const [, init] = mockFetch.mock.calls[0]! as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { tools?: Array<Record<string, unknown>> };
    expect(body.tools?.[0]).toHaveProperty("google_search");
  });

  it("omits tools when webSearch is disabled", async () => {
    const mockFetch = makeFetch(FIXTURE_OK);
    const p = new GeminiProvider({ apiKey: "k", webSearch: false, fetch: mockFetch as unknown as typeof fetch });
    await p.query("p");
    const [, init] = mockFetch.mock.calls[0]! as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { tools?: unknown[] };
    expect(body.tools).toBeUndefined();
  });
});

// ── Retry + error handling ──────────────────────────────────────────────────────

describe("GeminiProvider — retry + errors", () => {
  it("throws GeminiApiError on 400 without retrying", async () => {
    const mockFetch = makeFetch({ error: "bad request" }, 400);
    const p = new GeminiProvider({ apiKey: "k", fetch: mockFetch as unknown as typeof fetch, baseDelayMs: 0 });
    await expect(p.query("p")).rejects.toBeInstanceOf(GeminiApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 503 and succeeds on the second attempt", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503, statusText: "unavailable" }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(FIXTURE_OK), { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" } }),
      );
    const p = new GeminiProvider({ apiKey: "k", fetch: mockFetch as unknown as typeof fetch, baseDelayMs: 0 });
    const res = await p.query("p");
    expect(res.text).toContain("GrowthHackers");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting maxRetries on a persistent 500", async () => {
    const mockFetch = makeFetch("", 500);
    const p = new GeminiProvider({ apiKey: "k", fetch: mockFetch as unknown as typeof fetch, maxRetries: 2, baseDelayMs: 0 });
    await expect(p.query("p")).rejects.toBeInstanceOf(GeminiApiError);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry a malformed but HTTP-200 payload — parsing is deterministic", async () => {
    const mockFetch = makeFetch({ candidates: 5 });
    const p = new GeminiProvider({ apiKey: "k", fetch: mockFetch as unknown as typeof fetch, baseDelayMs: 0 });
    const res = await p.query("p");
    expect(res.text).toBe("");
    expect(res.citations).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
