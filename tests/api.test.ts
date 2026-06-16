import { describe, it, expect } from "vitest";
import {
  createApp,
  buildConfigFromUrl,
  buildProviders,
  sanitizeBrandName,
  type RateLimiter,
  type ScanResponse,
} from "../src/api/scan";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const API_KEY = "test-secret-key";

/** Rate limiter that always blocks — tests the 429 path. */
const blockAll: RateLimiter = { check: () => false };

/** Rate limiter that always allows — prevents rate-limit interference in other tests. */
const allowAll: RateLimiter = { check: () => true };

/** Authenticated app (API_KEY set, rate limit bypassed). */
function authApp() {
  return createApp({ scanApiKey: API_KEY, rateLimiter: allowAll });
}

/** Open app (no API key, rate limit bypassed). */
function openApp() {
  return createApp({ scanApiKey: "", rateLimiter: allowAll });
}

/** Build a POST /api/scan Request with optional headers. */
function scanRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// ─── sanitizeBrandName ────────────────────────────────────────────────────────

describe("sanitizeBrandName", () => {
  it("clean — passes alphanum + hyphen names through unchanged", () => {
    expect(sanitizeBrandName("Acme")).toBe("Acme");
    expect(sanitizeBrandName("My-Brand")).toBe("My-Brand");
    expect(sanitizeBrandName("Brand123")).toBe("Brand123");
  });

  it("injected — strips non-alphanum/hyphen chars (script tags, underscores, angle brackets)", () => {
    // Simulates a raw brand name that somehow contains injection chars
    // (defense-in-depth: sanitize regardless of upstream validation)
    expect(sanitizeBrandName("<script>xss")).toBe("scriptxss");
    expect(sanitizeBrandName("evil_brand")).toBe("evilbrand");
    expect(sanitizeBrandName("my brand")).toBe("mybrand");        // space stripped
    expect(sanitizeBrandName("hello.world")).toBe("helloworld");  // dot stripped
  });

  it("truncated — caps at 50 chars regardless of input length", () => {
    const hundred = "A".repeat(100);
    const result = sanitizeBrandName(hundred);
    expect(result.length).toBe(50);
    expect(result).toBe("A".repeat(50));

    // Long hyphenated name with 60 chars — truncated to 50
    const longHyphen = "a-very-very-long-brand-name-that-exceeds-fifty-chars";
    const truncated = sanitizeBrandName(longHyphen);
    expect(truncated.length).toBeLessThanOrEqual(50);
    // All retained chars must still be safe
    expect(truncated).toMatch(/^[a-zA-Z0-9-]*$/);
  });
});

// ─── buildConfigFromUrl ────────────────────────────────────────────────────────

describe("buildConfigFromUrl", () => {
  it("capitalises the first segment of the hostname as the brand name", () => {
    const cfg = buildConfigFromUrl("https://acme.io");
    expect(cfg.brand.name).toBe("Acme");
    expect(cfg.brand.domain).toBe("acme.io");
    expect(cfg.brand.aliases).toContain("acme.io");
  });

  it("strips the www. prefix from the domain", () => {
    const cfg = buildConfigFromUrl("https://www.example.com/path?q=1#anchor");
    expect(cfg.brand.domain).toBe("example.com");
    expect(cfg.brand.name).toBe("Example");
  });

  it("throws a TypeError for an invalid URL string", () => {
    expect(() => buildConfigFromUrl("not-a-url")).toThrow(TypeError);
    expect(() => buildConfigFromUrl("")).toThrow(TypeError);
  });

  it("derived brand name always contains only safe chars", () => {
    const urls = [
      "https://growthackers.io",
      "https://my-brand.io",
      "https://brand123.io",
    ];
    for (const url of urls) {
      const cfg = buildConfigFromUrl(url);
      expect(cfg.brand.name).toMatch(/^[a-zA-Z0-9-]+$/);
      expect(cfg.brand.name.length).toBeLessThanOrEqual(50);
    }
  });

  it("truncates brand name from a very long hostname segment to max 50 chars", () => {
    // 60-char first segment — all valid URL chars (hyphens + alphanum)
    const longSegment = "a-very-very-long-brand-name-that-exceeds-fifty-chars-limit";
    const cfg = buildConfigFromUrl(`https://${longSegment}.io`);
    expect(cfg.brand.name.length).toBeLessThanOrEqual(50);
    expect(cfg.brand.name).toMatch(/^[a-zA-Z0-9-]*$/);
  });
});

// ─── buildProviders ────────────────────────────────────────────────────────────

describe("buildProviders", () => {
  it("returns a MockProvider instance for the 'mock' name", () => {
    const providers = buildProviders(["mock"]);
    expect(providers).toHaveLength(1);
    expect(providers[0]?.engine).toBe("mock");
  });

  it("throws with a descriptive message for an unknown provider name", () => {
    expect(() => buildProviders(["gpt-99-ultra"])).toThrow(/Unknown provider/);
    expect(() => buildProviders(["gpt-99-ultra"])).toThrow(/gpt-99-ultra/);
  });
});

// ─── POST /api/scan — authentication ─────────────────────────────────────────

describe("POST /api/scan — auth", () => {
  it("returns 401 when the API key is set and no Authorization header is sent", async () => {
    const app = authApp();
    const res = await app.request(scanRequest({ url: "https://acme.io" }));
    const json = (await res.json()) as ScanResponse;
    expect(res.status).toBe(401);
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/unauthorized/i);
  });

  it("returns 401 for an incorrect Bearer token", async () => {
    const app = authApp();
    const res = await app.request(
      scanRequest({ url: "https://acme.io" }, { Authorization: "Bearer wrong-token" }),
    );
    expect(res.status).toBe(401);
  });

  it("allows requests when no API key is configured (open / dev mode)", async () => {
    const app = openApp();
    const res = await app.request(
      scanRequest({ url: "https://acme.io", providers: ["mock"] }),
    );
    expect(res.status).toBe(200);
  });
});

// ─── POST /api/scan — rate limiting ───────────────────────────────────────────

describe("POST /api/scan — rate limit", () => {
  it("returns 429 when the injected rate limiter blocks the request", async () => {
    const app = createApp({ scanApiKey: "", rateLimiter: blockAll });
    const res = await app.request(
      scanRequest({ url: "https://acme.io", providers: ["mock"] }),
    );
    const json = (await res.json()) as ScanResponse;
    expect(res.status).toBe(429);
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/rate limit/i);
  });
});

// ─── POST /api/scan — input validation ────────────────────────────────────────

describe("POST /api/scan — validation", () => {
  it("returns 400 for a malformed (non-JSON) body", async () => {
    const app = openApp();
    const req = new Request("http://localhost/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not { valid json >>>",
    });
    const res = await app.request(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when the required 'url' field is absent", async () => {
    const app = openApp();
    const res = await app.request(scanRequest({ providers: ["mock"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid URL value", async () => {
    const app = openApp();
    const res = await app.request(scanRequest({ url: "this-is-not-a-url" }));
    const json = (await res.json()) as ScanResponse;
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/invalid url/i);
  });

  it("returns 400 for an unknown provider name", async () => {
    const app = openApp();
    const res = await app.request(
      scanRequest({ url: "https://acme.io", providers: ["model-x-9000"] }),
    );
    const json = (await res.json()) as ScanResponse;
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/unknown provider/i);
  });
});

// ─── POST /api/scan — happy path ──────────────────────────────────────────────

describe("POST /api/scan — happy path", () => {
  it("returns 200 with a valid TrackingReport for a well-formed request", async () => {
    const app = openApp();
    const res = await app.request(
      scanRequest({ url: "https://growthackers.io", providers: ["mock"] }),
    );
    const json = (await res.json()) as ScanResponse;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(typeof json.result?.visibilityScore).toBe("number");
    expect(json.result?.visibilityScore).toBeGreaterThanOrEqual(0);
    expect(json.result?.visibilityScore).toBeLessThanOrEqual(100);
    // brand is derived from the first DNS label of the URL: growthackers.io → "Growthackers"
    expect(json.result?.brand).toBe("Growthackers");
  });

  it("defaults to the mock provider when 'providers' is omitted", async () => {
    const app = openApp();
    const res = await app.request(scanRequest({ url: "https://acme.io" }));
    const json = (await res.json()) as ScanResponse;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.result?.engines).toContain("mock");
  });

  it("accepts and uses the correct Bearer token for an authenticated request", async () => {
    const app = authApp();
    const res = await app.request(
      scanRequest(
        { url: "https://acme.io", providers: ["mock"] },
        { Authorization: `Bearer ${API_KEY}` },
      ),
    );
    const json = (await res.json()) as ScanResponse;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.result?.brand).toBe("Acme");
  });
});
