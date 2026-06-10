/**
 * gh-ai-rank-tracker — Aegis integration tests for POST /api/scan
 *
 * W6·QA run 10: covers the previously untested path where the Aegis guard
 * returns safe=false → POST /api/scan responds 400 with the threat type.
 *
 * Uses the injectable aegisGuard option in createApp() so tests are fully
 * deterministic and do not require AEGIS_ENABLED in the environment.
 */
import { describe, it, expect, vi } from "vitest";
import { createApp, type RateLimiter } from "../src/api/scan";
import type { AegisGuard, ScanResult } from "../aegis";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Rate limiter that always allows — prevents rate-limit interference. */
const allowAll: RateLimiter = { check: () => true };

/** Open app (no API key). Accepts an optional Aegis guard override. */
function openApp(aegisGuard?: AegisGuard) {
  return createApp({ scanApiKey: "", rateLimiter: allowAll, aegisGuard });
}

function scanRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// ─── Aegis guard injection helpers ───────────────────────────────────────────

function blockingGuard(threatType = "PROMPT_INJECTION"): AegisGuard {
  return {
    scan: vi.fn().mockResolvedValue({
      safe: false,
      score: 95,
      threatType,
      details: [`Blocked by test stub: ${threatType}`],
    } satisfies ScanResult),
  };
}

function passThroughGuard(): AegisGuard {
  return {
    scan: vi.fn().mockResolvedValue({ safe: true, score: 0 } satisfies ScanResult),
  };
}

// ─── Aegis block path tests ───────────────────────────────────────────────────

describe("POST /api/scan — Aegis guard block path", () => {
  it("returns 400 when the Aegis guard blocks a PROMPT_INJECTION", async () => {
    const app = openApp(blockingGuard("PROMPT_INJECTION"));
    const res = await app.request(
      scanRequest({ url: "https://acme.io" }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/input blocked/i);
    expect(json.error).toContain("PROMPT_INJECTION");
  });

  it("returns 400 when the Aegis guard blocks a JAILBREAK attempt", async () => {
    const app = openApp(blockingGuard("JAILBREAK"));
    const res = await app.request(
      scanRequest({ url: "https://acme.io" }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toContain("JAILBREAK");
  });

  it("returns 400 with UNKNOWN_THREAT when threatType is absent from guard result", async () => {
    const app = openApp({
      scan: vi.fn().mockResolvedValue({ safe: false, score: 80 } satisfies ScanResult),
    });
    const res = await app.request(
      scanRequest({ url: "https://acme.io" }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("UNKNOWN_THREAT");
  });

  it("does NOT call runTracking when the Aegis guard blocks the request", async () => {
    const guard = blockingGuard("PROMPT_INJECTION");
    const app = openApp(guard);
    await app.request(scanRequest({ url: "https://acme.io" }));

    // Guard scan was called once with the URL
    expect(guard.scan).toHaveBeenCalledOnce();
    expect(guard.scan).toHaveBeenCalledWith(
      "https://acme.io",
      { scope: "input" },
    );
  });

  it("proceeds normally (200) when the Aegis guard allows the request", async () => {
    const guard = passThroughGuard();
    const app = openApp(guard);
    const res = await app.request(
      scanRequest({ url: "https://acme.io", providers: ["mock"] }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    // Guard was called (pass-through)
    expect(guard.scan).toHaveBeenCalledOnce();
  });

  it("Aegis guard is called with the exact URL string from the request body", async () => {
    const guard = passThroughGuard();
    const app = openApp(guard);
    await app.request(
      scanRequest({ url: "https://growthackers.io", providers: ["mock"] }),
    );
    expect(guard.scan).toHaveBeenCalledWith(
      "https://growthackers.io",
      { scope: "input" },
    );
  });

  it("Aegis guard is not called when request fails validation before guard (missing url)", async () => {
    const guard = blockingGuard();
    const app = openApp(guard);
    // Missing url field → fails validation before Aegis runs
    const res = await app.request(scanRequest({ providers: ["mock"] }));

    expect(res.status).toBe(400);
    expect(guard.scan).not.toHaveBeenCalled();
  });
});

// ─── Aegis guard is NOT skipped at rate-limit ─────────────────────────────────

describe("POST /api/scan — Aegis guard interaction with rate limiter", () => {
  it("rate-limit check runs before Aegis (Aegis scan not called when rate-limited)", async () => {
    const blockingRL: RateLimiter = { check: () => false };
    const guard = passThroughGuard();
    const app = createApp({ scanApiKey: "", rateLimiter: blockingRL, aegisGuard: guard });
    const res = await app.request(
      scanRequest({ url: "https://acme.io", providers: ["mock"] }),
    );

    expect(res.status).toBe(429);
    // Aegis scan should NOT have been called — rate limiter fired first
    expect(guard.scan).not.toHaveBeenCalled();
  });
});
