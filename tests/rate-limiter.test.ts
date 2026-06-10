/**
 * InMemoryRateLimiter — sliding-window unit tests
 *
 * Tests the rate-limiter class exported from src/api/scan.ts directly,
 * bypassing the HTTP layer. Uses vitest fake timers to control Date.now()
 * so the window boundary logic can be exercised deterministically.
 *
 * Run: npm test
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InMemoryRateLimiter } from "../src/api/scan";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Advance fake time by ms milliseconds. */
function tick(ms: number) {
  vi.advanceTimersByTime(ms);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("InMemoryRateLimiter — sliding window", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Happy path ───────────────────────────────────────────────────────────────

  it("allows the first request for a new IP", () => {
    const limiter = new InMemoryRateLimiter(60_000, 10);
    expect(limiter.check("1.2.3.4")).toBe(true);
  });

  it("allows requests up to maxRequests within the window", () => {
    const limiter = new InMemoryRateLimiter(60_000, 5);
    for (let i = 0; i < 5; i++) {
      expect(limiter.check("10.0.0.1")).toBe(true);
    }
  });

  it("blocks the request immediately after maxRequests is reached", () => {
    const limiter = new InMemoryRateLimiter(60_000, 3);
    limiter.check("10.0.0.1");
    limiter.check("10.0.0.1");
    limiter.check("10.0.0.1"); // hits the limit
    expect(limiter.check("10.0.0.1")).toBe(false); // 4th request → blocked
  });

  // ── Sliding window expiry ─────────────────────────────────────────────────

  it("allows a new request once old timestamps slide out of the window", () => {
    const limiter = new InMemoryRateLimiter(60_000, 2);
    // fill the window
    limiter.check("5.5.5.5");
    limiter.check("5.5.5.5");
    expect(limiter.check("5.5.5.5")).toBe(false); // 3rd → blocked

    // advance 60 001 ms — first 2 timestamps now fall outside window
    tick(60_001);
    expect(limiter.check("5.5.5.5")).toBe(true); // window cleared
  });

  it("partial expiry — only expired timestamps slide out (window is truly sliding)", () => {
    const limiter = new InMemoryRateLimiter(60_000, 3);
    limiter.check("6.6.6.6"); // t=0
    tick(30_000);
    limiter.check("6.6.6.6"); // t=30 000
    limiter.check("6.6.6.6"); // t=30 000 — now at limit

    // At t=60_001: the t=0 timestamp slides out but t=30000 × 2 still in window
    tick(30_001); // now at t=60_001
    // still 2 valid timestamps (t=30000) inside 60s window from now (t=60_001)
    expect(limiter.check("6.6.6.6")).toBe(true); // 1 slot freed → allowed
    // now 3 timestamps in window again → next is blocked
    expect(limiter.check("6.6.6.6")).toBe(false);
  });

  it("allows request exactly at window boundary (cutoff = now - windowMs, exclusive)", () => {
    const limiter = new InMemoryRateLimiter(60_000, 1);
    limiter.check("7.7.7.7"); // t=0 → limit reached
    // advance to exactly windowMs — the t=0 timestamp is NOT > cutoff (cutoff = now - 60000 = 0)
    // so it should still be in-window → blocked
    tick(60_000);
    expect(limiter.check("7.7.7.7")).toBe(false);

    // advance 1 ms more → cutoff = 1, t=0 is NOT > 1 → expires → allowed
    tick(1);
    expect(limiter.check("7.7.7.7")).toBe(true);
  });

  // ── Per-IP isolation ───────────────────────────────────────────────────────

  it("different IPs have independent rate-limit buckets", () => {
    const limiter = new InMemoryRateLimiter(60_000, 2);
    // fill IP-A
    limiter.check("192.168.1.1");
    limiter.check("192.168.1.1");
    expect(limiter.check("192.168.1.1")).toBe(false); // IP-A blocked

    // IP-B is a clean slate
    expect(limiter.check("192.168.1.2")).toBe(true);
    expect(limiter.check("192.168.1.2")).toBe(true);
    expect(limiter.check("192.168.1.2")).toBe(false); // IP-B now also blocked
  });

  it("many IPs coexist — each has its own quota", () => {
    const limiter = new InMemoryRateLimiter(60_000, 1);
    const ips = ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4", "10.0.0.5"];
    for (const ip of ips) {
      expect(limiter.check(ip)).toBe(true);  // first request: allowed
      expect(limiter.check(ip)).toBe(false); // second: blocked
    }
  });

  // ── Custom window / maxRequests ─────────────────────────────────────────────

  it("custom 1-second window with max 3 requests", () => {
    const limiter = new InMemoryRateLimiter(1_000, 3);
    expect(limiter.check("a")).toBe(true);
    expect(limiter.check("a")).toBe(true);
    expect(limiter.check("a")).toBe(true);
    expect(limiter.check("a")).toBe(false); // 4th → blocked

    tick(1_001); // window cleared
    expect(limiter.check("a")).toBe(true);
  });

  it("maxRequests=1 — allows first, blocks second, resets after window", () => {
    const limiter = new InMemoryRateLimiter(60_000, 1);
    expect(limiter.check("x")).toBe(true);
    expect(limiter.check("x")).toBe(false);
    tick(60_001);
    expect(limiter.check("x")).toBe(true);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  it("unknown IP string ('unknown') is rate-limited independently", () => {
    // src/api/scan.ts falls back to 'unknown' when no x-forwarded-for header
    const limiter = new InMemoryRateLimiter(60_000, 2);
    expect(limiter.check("unknown")).toBe(true);
    expect(limiter.check("unknown")).toBe(true);
    expect(limiter.check("unknown")).toBe(false);
  });

  it("handles empty-string IP key without throwing", () => {
    const limiter = new InMemoryRateLimiter(60_000, 1);
    expect(() => limiter.check("")).not.toThrow();
    expect(limiter.check("")).toBe(true);  // first call: allowed
    expect(limiter.check("")).toBe(false); // second call: blocked
  });
});
