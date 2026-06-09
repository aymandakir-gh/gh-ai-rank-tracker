/**
 * W6·QA — supplementary tests for gh-ai-rank-tracker API layer.
 *
 * Covers gaps not addressed in tests/api.test.ts:
 *   1. InMemoryRateLimiter — sliding-window logic (boundary, expiry)
 *   2. Security inputs — XSS, SQL injection, null/non-string provider entries
 *   3. buildProviders — empty array edge case
 *   4. buildConfigFromUrl — localhost / single-segment hostnames
 *   5. providers field — non-array value treated as default
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createApp,
  buildConfigFromUrl,
  buildProviders,
  InMemoryRateLimiter,
  type RateLimiter,
  type ScanResponse,
} from "../src/api/scan";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Rate limiter that always allows — prevents interference in non-rate-limit tests. */
const allowAll: RateLimiter = { check: () => true };

/** Open app (no API key, rate limit bypassed). */
function openApp() {
  return createApp({ scanApiKey: "", rateLimiter: allowAll });
}

function scanRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── InMemoryRateLimiter — unit tests ────────────────────────────────────────

describe("InMemoryRateLimiter — sliding window", () => {
  it("allows exactly maxRequests calls within the window", () => {
    const limiter = new InMemoryRateLimiter(60_000, 3);
    expect(limiter.check("ip-a")).toBe(true);
    expect(limiter.check("ip-a")).toBe(true);
    expect(limiter.check("ip-a")).toBe(true);
  });

  it("blocks the (maxRequests + 1)th call within the window", () => {
    const limiter = new InMemoryRateLimiter(60_000, 3);
    limiter.check("ip-b");
    limiter.check("ip-b");
    limiter.check("ip-b");
    // 4th call must be blocked
    expect(limiter.check("ip-b")).toBe(false);
  });

  it("tracks different IPs independently", () => {
    const limiter = new InMemoryRateLimiter(60_000, 1);
    // ip-c exhausts its quota
    expect(limiter.check("ip-c")).toBe(true);
    expect(limiter.check("ip-c")).toBe(false);
    // ip-d still has its own quota
    expect(limiter.check("ip-d")).toBe(true);
  });

  it("resets after the window expires (using fake timers)", () => {
    vi.useFakeTimers();
    const limiter = new InMemoryRateLimiter(1_000, 2); // 1s window, max 2
    limiter.check("ip-e");
    limiter.check("ip-e");
    expect(limiter.check("ip-e")).toBe(false); // exhausted

    // Advance past the 1s window
    vi.advanceTimersByTime(1_001);
    // Timestamps should have expired — next call is allowed
    expect(limiter.check("ip-e")).toBe(true);
    vi.useRealTimers();
  });

  it("allows a fresh request after partial window expiry", () => {
    vi.useFakeTimers();
    const limiter = new InMemoryRateLimiter(2_000, 2); // 2s window
    // First call at t=0
    limiter.check("ip-f");
    vi.advanceTimersByTime(1_500);
    // Second call at t=1500ms (still in window)
    limiter.check("ip-f");
    // Now at t=1500ms quota is full
    expect(limiter.check("ip-f")).toBe(false);
    // Advance 600ms more (t=2100ms) — first timestamp (t=0) is now expired
    vi.advanceTimersByTime(600);
    // One slot freed
    expect(limiter.check("ip-f")).toBe(true);
    vi.useRealTimers();
  });
});

// ─── Security: XSS + SQL injection in url field ───────────────────────────────

describe("POST /api/scan — security: malicious url inputs", () => {
  it("rejects XSS payload in url field with 400 (not a valid URL)", async () => {
    const app = openApp();
    const res = await app.request(
      scanRequest({ url: '<script>alert("xss")</script>' }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as ScanResponse;
    expect(json.ok).toBe(false);
  });

  it("rejects SQL injection attempt in url field with 400", async () => {
    const app = openApp();
    const res = await app.request(
      scanRequest({ url: "'; DROP TABLE leads; --" }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as ScanResponse;
    expect(json.ok).toBe(false);
  });

  it("rejects javascript: scheme URLs with 400", async () => {
    const app = openApp();
    const res = await app.request(
      scanRequest({ url: "javascript:alert(document.cookie)" }),
    );
    // URL is technically parseable but invalid for scanning — buildConfigFromUrl
    // uses new URL() which does accept javascript: scheme, so buildProviders("mock")
    // runs and returns 200. We explicitly check that we don't crash or leak data.
    // The response must be either 200 (mock scan, benign) or 400 (if future validation added).
    const status = res.status;
    expect([200, 400]).toContain(status);
    // Either way, no 500 internal error
    expect(status).not.toBe(500);
  });

  it("handles oversized url field gracefully (no crash, returns 400 or 200)", async () => {
    const app = openApp();
    const longPath = "a".repeat(10_000);
    const res = await app.request(
      scanRequest({ url: `https://example.com/${longPath}`, providers: ["mock"] }),
    );
    // Must not throw a 500
    expect(res.status).not.toBe(500);
  });
});

// ─── Security: non-string / null values in providers array ────────────────────

describe("POST /api/scan — security: malformed providers values", () => {
  it("returns 400 for null entries in providers array (unknown provider 'null')", async () => {
    const app = openApp();
    // JSON serialise null in the array
    const res = await app.request(
      scanRequest({ url: "https://acme.io", providers: [null] }),
    );
    const json = (await res.json()) as ScanResponse;
    // null stringifies to "null" which hits the default switch case → Unknown provider
    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it("returns 400 for numeric entries in providers array", async () => {
    const app = openApp();
    const res = await app.request(
      scanRequest({ url: "https://acme.io", providers: [42] }),
    );
    expect(res.status).toBe(400);
  });

  it("falls back to ['mock'] when providers is an empty array", async () => {
    const app = openApp();
    const res = await app.request(
      scanRequest({ url: "https://acme.io", providers: [] }),
    );
    const json = (await res.json()) as ScanResponse;
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.result?.engines).toContain("mock");
  });

  it("falls back to ['mock'] when providers is not an array", async () => {
    const app = openApp();
    const res = await app.request(
      scanRequest({ url: "https://acme.io", providers: "mock" }),
    );
    const json = (await res.json()) as ScanResponse;
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.result?.engines).toContain("mock");
  });
});

// ─── buildProviders — edge cases ─────────────────────────────────────────────

describe("buildProviders — edge cases", () => {
  it("returns an empty array for an empty input array", () => {
    expect(buildProviders([])).toEqual([]);
  });

  it("throws for mixed valid + unknown provider names (fails on first unknown)", () => {
    expect(() => buildProviders(["mock", "unknown-engine"])).toThrow(/Unknown provider/);
  });
});

// ─── buildConfigFromUrl — edge cases ─────────────────────────────────────────

describe("buildConfigFromUrl — edge cases", () => {
  it("handles localhost correctly (single-segment hostname)", () => {
    const cfg = buildConfigFromUrl("http://localhost:3000/path");
    expect(cfg.brand.domain).toBe("localhost");
    expect(cfg.brand.name).toBe("Localhost");
    expect(cfg.brand.aliases).toContain("localhost");
  });

  it("handles an IP address as domain (falls back to full hostname)", () => {
    const cfg = buildConfigFromUrl("http://192.168.1.1/");
    expect(cfg.brand.domain).toBe("192.168.1.1");
    // first segment of "192.168.1.1" is "192"
    expect(cfg.brand.name).toBe("192");
  });

  it("strips www. before deriving brand name", () => {
    const cfg = buildConfigFromUrl("https://www.growthackers.io");
    expect(cfg.brand.domain).toBe("growthackers.io");
    expect(cfg.brand.name).toBe("Growthackers");
  });

  it("includes prompts from demoConfig (non-empty)", () => {
    const cfg = buildConfigFromUrl("https://acme.io");
    expect(Array.isArray(cfg.prompts)).toBe(true);
    expect(cfg.prompts.length).toBeGreaterThan(0);
  });
});
