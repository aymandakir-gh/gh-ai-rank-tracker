/**
 * tests/api/scan.test.ts
 *
 * Unit + integration tests for src/api/scan.ts
 * Added by W6·QA run 28 — 2026-06-10.
 *
 * Covers:
 *   - sanitizeBrandName (OWASP A03 input sanitization)
 *   - buildConfigFromUrl (URL parsing + brand derivation)
 *   - buildProviders (provider instantiation + error paths)
 *   - InMemoryRateLimiter (sliding-window logic + isolation)
 *   - GET /health (no auth required)
 *   - POST /api/scan: auth (skip/pass/fail), rate-limit 429,
 *     body validation 400, aegis block 400, happy path 200
 */

import { describe, it, expect, vi } from "vitest";
import {
  createApp,
  buildConfigFromUrl,
  buildProviders,
  sanitizeBrandName,
  InMemoryRateLimiter,
  type RateLimiter,
} from "../../src/api/scan";
import type { AegisGuard } from "../../src/aegis";

// ─── Shared test doubles ───────────────────────────────────────────────────────

/** Limiter that always allows — eliminates rate-limit noise in other suites. */
const unlimitedLimiter: RateLimiter = { check: () => true };

/** Aegis guard that always passes — eliminates aegis noise in other suites. */
const passAegis: AegisGuard = {
  scan: async () => ({ safe: true, score: 0 }),
};

/** Loose shape for decoded JSON scan responses used in assertions. */
type ScanBody = {
  ok?: boolean;
  error?: string;
  result?: { visibilityScore?: number; brand?: string };
};

// ─── sanitizeBrandName ────────────────────────────────────────────────────────

describe("sanitizeBrandName", () => {
  it("passes clean alphanumeric input unchanged", () => {
    expect(sanitizeBrandName("GrowthHackers")).toBe("GrowthHackers");
  });

  it("preserves hyphens", () => {
    expect(sanitizeBrandName("my-brand")).toBe("my-brand");
  });

  it("strips angle brackets and quotes (XSS guard)", () => {
    expect(sanitizeBrandName("<script>xss</script>")).toBe("scriptxssscript");
  });

  it("strips SQL-injection metacharacters", () => {
    expect(sanitizeBrandName("'; DROP TABLE brands; --")).toBe(
      "DROPTABLEbrands--",
    );
  });

  it("truncates at 50 characters", () => {
    expect(sanitizeBrandName("A".repeat(100))).toBe("A".repeat(50));
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeBrandName("")).toBe("");
  });

  it("returns empty string when all characters are stripped", () => {
    expect(sanitizeBrandName("!@#$%^&*()")).toBe("");
  });
});

// ─── buildConfigFromUrl ───────────────────────────────────────────────────────

describe("buildConfigFromUrl", () => {
  it("extracts hostname as domain", () => {
    const cfg = buildConfigFromUrl("https://growthackers.io/pricing?ref=test");
    expect(cfg.brand.domain).toBe("growthackers.io");
  });

  it("strips www. prefix from domain", () => {
    const cfg = buildConfigFromUrl("https://www.example.com");
    expect(cfg.brand.domain).toBe("example.com");
  });

  it("capitalizes the first domain segment as the brand name", () => {
    const cfg = buildConfigFromUrl("https://acme.co");
    expect(cfg.brand.name).toBe("Acme");
  });

  it("brand name contains only safe characters", () => {
    const cfg = buildConfigFromUrl("https://my-brand.io");
    expect(cfg.brand.name).toMatch(/^[a-zA-Z0-9-]+$/);
  });

  it("includes domain in aliases", () => {
    const cfg = buildConfigFromUrl("https://growthackers.io");
    expect(cfg.brand.aliases).toContain("growthackers.io");
  });

  it("attaches demo prompts to the config", () => {
    const cfg = buildConfigFromUrl("https://example.com");
    expect(Array.isArray(cfg.prompts)).toBe(true);
    expect(cfg.prompts.length).toBeGreaterThan(0);
  });

  it("throws TypeError for an invalid URL string", () => {
    expect(() => buildConfigFromUrl("not-a-url")).toThrow(TypeError);
  });

  it("throws TypeError for an empty string", () => {
    expect(() => buildConfigFromUrl("")).toThrow(TypeError);
  });
});

// ─── buildProviders ───────────────────────────────────────────────────────────

describe("buildProviders", () => {
  it("returns one MockProvider for ['mock']", () => {
    const providers = buildProviders(["mock"]);
    expect(providers).toHaveLength(1);
  });

  it("returns two instances for ['mock', 'mock']", () => {
    const providers = buildProviders(["mock", "mock"]);
    expect(providers).toHaveLength(2);
  });

  it("throws with a descriptive message for an unknown name", () => {
    expect(() => buildProviders(["unknown-xyz"])).toThrow(/Unknown provider/);
  });

  it("throws for 'perplexity' when PERPLEXITY_API_KEY is absent", () => {
    const saved = process.env["PERPLEXITY_API_KEY"];
    delete process.env["PERPLEXITY_API_KEY"];
    try {
      expect(() => buildProviders(["perplexity"])).toThrow();
    } finally {
      if (saved !== undefined) process.env["PERPLEXITY_API_KEY"] = saved;
    }
  });
});

// ─── InMemoryRateLimiter ──────────────────────────────────────────────────────

describe("InMemoryRateLimiter", () => {
  it("allows requests up to maxRequests", () => {
    const limiter = new InMemoryRateLimiter(60_000, 3);
    expect(limiter.check("1.1.1.1")).toBe(true);
    expect(limiter.check("1.1.1.1")).toBe(true);
    expect(limiter.check("1.1.1.1")).toBe(true);
  });

  it("blocks the (maxRequests + 1)th request from the same IP", () => {
    const limiter = new InMemoryRateLimiter(60_000, 2);
    limiter.check("2.2.2.2");
    limiter.check("2.2.2.2");
    expect(limiter.check("2.2.2.2")).toBe(false);
  });

  it("counts are isolated per IP address", () => {
    const limiter = new InMemoryRateLimiter(60_000, 1);
    limiter.check("3.3.3.3"); // exhaust for this IP
    expect(limiter.check("4.4.4.4")).toBe(true); // different IP must pass
  });

  it("resets after the window expires", async () => {
    const limiter = new InMemoryRateLimiter(10 /* ms */, 1);
    limiter.check("5.5.5.5");
    expect(limiter.check("5.5.5.5")).toBe(false); // blocked within window
    await new Promise((r) => setTimeout(r, 25));
    expect(limiter.check("5.5.5.5")).toBe(true); // window expired → allowed
  });
});

// ─── GET /health ──────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns 200 without any authentication", async () => {
    const app = createApp({});
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("body contains ok:true, version, and ts", async () => {
    const app = createApp({});
    // Hono's app.request() resolves to a Response for sync handlers (no .then on
    // the call itself) — await it, then read the JSON body.
    const res = await app.request("/health");
    const body = (await res.json()) as { ok: boolean; version: string; ts: number };
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe("string");
    expect(typeof body.ts).toBe("number");
  });
});

// ─── POST /api/scan — authentication ─────────────────────────────────────────

describe("POST /api/scan — authentication", () => {
  const makeReq = (extra?: Record<string, string>) =>
    ({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "127.0.0.1",
        ...extra,
      },
      body: JSON.stringify({ url: "https://example.com", providers: ["mock"] }),
    }) satisfies RequestInit;

  it("skips auth entirely when no scanApiKey is set (dev mode)", async () => {
    const app = createApp({ rateLimiter: unlimitedLimiter, aegisGuard: passAegis });
    const res = await app.request("/api/scan", makeReq());
    expect(res.status).not.toBe(401);
  });

  it("returns 401 for a wrong Bearer token", async () => {
    const app = createApp({
      scanApiKey: "correct-secret",
      rateLimiter: unlimitedLimiter,
      aegisGuard: passAegis,
    });
    const res = await app.request(
      "/api/scan",
      makeReq({ Authorization: "Bearer wrong-secret" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header is absent but a key is set", async () => {
    const app = createApp({
      scanApiKey: "secret",
      rateLimiter: unlimitedLimiter,
      aegisGuard: passAegis,
    });
    const res = await app.request("/api/scan", makeReq());
    expect(res.status).toBe(401);
  });

  it("accepts the correct Bearer token", async () => {
    const app = createApp({
      scanApiKey: "my-api-key",
      rateLimiter: unlimitedLimiter,
      aegisGuard: passAegis,
    });
    const res = await app.request(
      "/api/scan",
      makeReq({ Authorization: "Bearer my-api-key" }),
    );
    expect(res.status).not.toBe(401);
  });
});

// ─── POST /api/scan — rate limiting ──────────────────────────────────────────

describe("POST /api/scan — rate limiting", () => {
  const scanBody = JSON.stringify({ url: "https://example.com", providers: ["mock"] });

  it("returns 429 immediately when the injected limiter returns false", async () => {
    const blockedLimiter: RateLimiter = { check: () => false };
    const app = createApp({ rateLimiter: blockedLimiter, aegisGuard: passAegis });
    const res = await app.request("/api/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "9.9.9.9",
      },
      body: scanBody,
    });
    expect(res.status).toBe(429);
    const body = (await res.json()) as ScanBody;
    expect(body.ok).toBe(false);
  });

  it("returns 429 after an InMemoryRateLimiter with limit=1 is exhausted", async () => {
    const limiter = new InMemoryRateLimiter(60_000, 1);
    const app = createApp({ rateLimiter: limiter, aegisGuard: passAegis });
    const opts: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.0.0.1",
      },
      body: scanBody,
    };
    await app.request("/api/scan", opts); // consume the one slot
    const res = await app.request("/api/scan", opts);
    expect(res.status).toBe(429);
  });
});

// ─── POST /api/scan — body validation ────────────────────────────────────────

describe("POST /api/scan — body validation", () => {
  const app = createApp({ rateLimiter: unlimitedLimiter, aegisGuard: passAegis });
  const hdrs: Record<string, string> = {
    "Content-Type": "application/json",
    "x-forwarded-for": "127.0.0.1",
  };

  it("returns 400 for malformed JSON", async () => {
    const res = await app.request("/api/scan", {
      method: "POST",
      headers: hdrs,
      body: "{ invalid json ]",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when url field is absent", async () => {
    const res = await app.request("/api/scan", {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ providers: ["mock"] }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when url is a whitespace-only string", async () => {
    const res = await app.request("/api/scan", {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ url: "   ", providers: ["mock"] }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when url is not a valid URL (no scheme)", async () => {
    const res = await app.request("/api/scan", {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ url: "not-a-real-url", providers: ["mock"] }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown provider name", async () => {
    const res = await app.request("/api/scan", {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ url: "https://example.com", providers: ["nonexistent"] }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ScanBody;
    expect(body.error).toMatch(/Unknown provider/);
  });
});

// ─── POST /api/scan — aegis guard ────────────────────────────────────────────

describe("POST /api/scan — aegis guard", () => {
  it("returns 400 when the guard flags the URL as unsafe", async () => {
    const blockingAegis: AegisGuard = {
      scan: vi
        .fn()
        .mockResolvedValue({ safe: false, threatType: "PROMPT_INJECTION" }),
    };
    const app = createApp({ rateLimiter: unlimitedLimiter, aegisGuard: blockingAegis });
    const res = await app.request("/api/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "127.0.0.1",
      },
      body: JSON.stringify({ url: "https://example.com", providers: ["mock"] }),
    });
    expect(res.status).toBe(400);
    // Verify aegis was called with the URL and correct scope
    expect(blockingAegis.scan).toHaveBeenCalledWith("https://example.com", {
      scope: "input",
    });
  });

  it("includes the threat type in the error body", async () => {
    const blockingAegis: AegisGuard = {
      scan: vi.fn().mockResolvedValue({ safe: false, threatType: "JAILBREAK" }),
    };
    const app = createApp({ rateLimiter: unlimitedLimiter, aegisGuard: blockingAegis });
    const res = await app.request("/api/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "127.0.0.1",
      },
      body: JSON.stringify({ url: "https://example.com", providers: ["mock"] }),
    });
    const body = (await res.json()) as ScanBody;
    expect(body.ok).toBe(false);
    expect(body.error).toContain("JAILBREAK");
  });
});

// ─── POST /api/scan — happy path ──────────────────────────────────────────────

describe("POST /api/scan — happy path", () => {
  it("returns 200 with a TrackingReport when using mock provider", async () => {
    const app = createApp({ rateLimiter: unlimitedLimiter, aegisGuard: passAegis });
    const res = await app.request("/api/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "127.0.0.1",
      },
      body: JSON.stringify({ url: "https://growthackers.io", providers: ["mock"] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ScanBody;
    expect(body.ok).toBe(true);
    expect(body.result).toBeDefined();
    expect(typeof body.result?.visibilityScore).toBe("number");
    expect(body.result?.visibilityScore).toBeGreaterThanOrEqual(0);
    expect(body.result?.visibilityScore).toBeLessThanOrEqual(100);
  });

  it("defaults to mock provider when providers list is omitted", async () => {
    const app = createApp({ rateLimiter: unlimitedLimiter, aegisGuard: passAegis });
    const res = await app.request("/api/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "127.0.0.1",
      },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("response includes brand name derived from the URL", async () => {
    const app = createApp({ rateLimiter: unlimitedLimiter, aegisGuard: passAegis });
    const res = await app.request("/api/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "127.0.0.1",
      },
      body: JSON.stringify({ url: "https://acme.io", providers: ["mock"] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { brand: string } };
    expect(body.result.brand).toBe("Acme");
  });
});
