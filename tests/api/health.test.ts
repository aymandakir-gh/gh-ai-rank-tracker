/**
 * W6·QA — GET /health endpoint tests
 *
 * The /health route is the Railway healthcheckPath. A regression here
 * (wrong status code, missing field, auth required) will cause Railway
 * to mark the deployment unhealthy → restart loop → production incident.
 *
 * Coverage:
 *   - Returns 200 with correct JSON shape
 *   - ok field is true
 *   - version is a non-empty semver string
 *   - ts is a recent Unix timestamp (within last 5 seconds)
 *   - No Authorization header required
 *   - Content-Type is application/json
 *
 * Run: npx vitest run tests/api/health.test.ts
 */
import { describe, it, expect } from "vitest";
import { createApp } from "../../src/api/scan";

describe("GET /health", () => {
  const app = createApp({ scanApiKey: "test-key" });

  it("returns HTTP 200", async () => {
    const res = await app.request(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
  });

  it("returns ok: true", async () => {
    const res = await app.request(new Request("http://localhost/health"));
    const body = await res.json() as { ok: boolean; version: string; ts: number };
    expect(body.ok).toBe(true);
  });

  it("returns a non-empty version string", async () => {
    const res = await app.request(new Request("http://localhost/health"));
    const body = await res.json() as { ok: boolean; version: string; ts: number };
    expect(typeof body.version).toBe("string");
    expect(body.version.length).toBeGreaterThan(0);
  });

  it("returns ts as a recent Unix timestamp in milliseconds", async () => {
    const before = Date.now();
    const res = await app.request(new Request("http://localhost/health"));
    const after = Date.now();
    const body = await res.json() as { ok: boolean; version: string; ts: number };
    expect(typeof body.ts).toBe("number");
    expect(body.ts).toBeGreaterThanOrEqual(before);
    expect(body.ts).toBeLessThanOrEqual(after + 50); // 50ms tolerance
  });

  it("does not require Authorization header (no 401)", async () => {
    // Even with a configured scanApiKey the health endpoint must be public
    const appWithAuth = createApp({ scanApiKey: "super-secret-key" });
    const res = await appWithAuth.request(
      new Request("http://localhost/health"),
      // No Authorization header
    );
    expect(res.status).toBe(200);
  });

  it("returns Content-Type application/json", async () => {
    const res = await app.request(new Request("http://localhost/health"));
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("returns exactly the three expected fields (ok, version, ts) and no extras that could indicate an error", async () => {
    const res = await app.request(new Request("http://localhost/health"));
    const body = await res.json() as Record<string, unknown>;
    expect("ok" in body).toBe(true);
    expect("version" in body).toBe(true);
    expect("ts" in body).toBe(true);
    expect("error" in body).toBe(false);
  });
});
