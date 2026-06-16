/**
 * gh-ai-rank-tracker — HTTP API layer.
 *
 * POST /api/scan accepts a brand URL + provider list, runs a full tracking
 * pass through the requested AI-engine providers, and returns a TrackingReport
 * as JSON. Input is screened by the Aegis guard (prompt injection + jailbreak)
 * before any business logic executes.
 *
 * GET /health returns { ok: true, version, ts } — used by Railway healthcheck.
 *
 * Security:
 *   - Bearer-token auth via SCAN_API_KEY env var (skipped in dev if not set).
 *   - Constant-time token comparison via crypto.timingSafeEqual (OWASP A02).
 *   - In-memory sliding-window rate limit: 10 requests / IP / minute.
 *   - Input validated before any provider instantiation.
 *   - Aegis input guard: prompt-injection + jailbreak detection (set AEGIS_ENABLED=true to activate).
 *   - brandName sanitization: strips non-alphanum/hyphen chars, caps at 50 chars (OWASP A03).
 */

import { timingSafeEqual } from "crypto";
import { Hono, type Context } from "hono";
import { runTracking } from "../tracker";
import { MockProvider, type AnswerEngineProvider } from "../providers";
import { PerplexityProvider } from "../providers/perplexity";
import { OpenAIProvider } from "../providers/openai";
import { AnthropicProvider } from "../providers/anthropic";
import { GeminiProvider } from "../providers/gemini";
import type { TrackingReport, TrackingConfig } from "../types";
import { runCampaign, type Campaign, type CampaignRun } from "../campaign";
import { computeTrend, type Trend } from "../trends";
import { InMemoryStore, type TrackingStore } from "../store";
import { demoConfig, demoCampaign, demoProviders } from "../demo";
import { createAegisGuard, type AegisGuard } from "../aegis";

const VERSION = "0.7.0";

// ─── Rate limiter ─────────────────────────────────────────────────────────────

/** Injectable rate-limiter interface — swap out in tests for deterministic behaviour. */
export interface RateLimiter {
  check(ip: string): boolean;
}

/** In-memory sliding-window rate limiter. Thread-safe for single-process deployments. */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly map = new Map<string, number[]>();
  private callCount = 0;
  private readonly pruneEvery: number;

  /**
   * @param windowMs     Sliding window length in milliseconds (default 60 000).
   * @param maxRequests  Max requests allowed per IP within the window (default 10).
   * @param pruneEvery   Auto-prune dead-IP entries every N check() calls (default 100).
   *                     Pass a large number (e.g. 999_999) to disable auto-pruning in tests.
   */
  constructor(
    private readonly windowMs = 60_000,
    private readonly maxRequests = 10,
    pruneEvery = 100,
  ) {
    this.pruneEvery = pruneEvery;
  }

  /**
   * Remove all IP entries whose entire timestamp set has expired.
   *
   * Without pruning, the internal Map grows unbounded: every unique IP that
   * ever makes a request leaves a stale entry after its window expires. On
   * long-running instances with many unique IPs (crawlers, scanners, rotated
   * proxies) this causes a slow memory leak.
   *
   * `prune()` iterates the Map once and deletes any entry where no timestamp
   * falls inside the current window. It is safe to call at any time — active
   * IPs (with at least one in-window timestamp) are never removed.
   *
   * Called automatically inside check() every `pruneEvery` invocations.
   * May also be called externally (e.g., from a maintenance cron).
   */
  prune(): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    for (const [ip, timestamps] of this.map) {
      if (!timestamps.some((t) => t > cutoff)) {
        this.map.delete(ip);
      }
    }
  }

  /**
   * Number of IPs currently tracked in the internal map.
   * Exposed for testing/observability — not part of the RateLimiter interface.
   */
  get mapSize(): number {
    return this.map.size;
  }

  check(ip: string): boolean {
    // Auto-prune every `pruneEvery` calls to cap Map growth from dead IPs.
    if (++this.callCount % this.pruneEvery === 0) {
      this.prune();
    }

    const now = Date.now();
    const cutoff = now - this.windowMs;
    const timestamps = (this.map.get(ip) ?? []).filter((t) => t > cutoff);
    if (timestamps.length >= this.maxRequests) return false;
    timestamps.push(now);
    this.map.set(ip, timestamps);
    return true;
  }
}

// ─── Public types ─────────────────────────────────────────────────────────────

/** Request body for POST /api/scan. */
export interface ScanRequest {
  /**
   * Brand URL, e.g. "https://growthackers.io".
   * Used to infer brand name + domain. Demo prompt set is applied automatically.
   */
  url: string;
  /**
   * Provider names to query in parallel.
   * Supported: "mock" | "perplexity" | "openai" | "anthropic" | "gemini".
   * Defaults to ["mock"] when omitted.
   */
  providers?: string[];
}

/** JSON envelope returned by POST /api/scan. */
export interface ScanResponse {
  ok: boolean;
  result?: TrackingReport;
  error?: string;
}

/** Request body for POST /api/campaign. */
export interface CampaignRequest {
  /** Run the built-in demo campaign (no keys). Ignored when `campaign` is set. */
  useDemo?: boolean;
  /** A full campaign definition to run + persist. */
  campaign?: Campaign;
  /**
   * Provider names to query in parallel.
   * Supported: "mock" | "perplexity" | "openai" | "anthropic" | "gemini".
   * Defaults to ["mock"]. Live providers require the matching env key.
   */
  providers?: string[];
}

/** JSON envelope returned by the campaign endpoints. */
export interface CampaignResponse {
  ok: boolean;
  /** The run that was just executed (POST only). */
  run?: CampaignRun;
  /** Full persisted history for the campaign, oldest-first. */
  history?: CampaignRun[];
  /** Trend computed over the history. */
  trend?: Trend;
  error?: string;
}

/** Options for createApp — all fields injectable for testing. */
export interface AppOptions {
  /**
   * Override SCAN_API_KEY for testing.
   * Pass "" to disable auth (same as when the env var is unset → dev mode).
   */
  scanApiKey?: string;
  /** Injectable rate limiter — defaults to InMemoryRateLimiter(60_000, 10). */
  rateLimiter?: RateLimiter;
  /**
   * Injectable Aegis guard for input validation.
   * Defaults to createAegisGuard() which reads AEGIS_ENABLED env var.
   * In production set AEGIS_ENABLED=true; in tests inject a configured guard directly.
   */
  aegisGuard?: AegisGuard;
  /**
   * Campaign history store for /api/campaign. Defaults to an InMemoryStore
   * (per-process, lost on restart) so tests never touch disk. The server
   * entrypoint injects a JsonFileStore for real local-first persistence.
   */
  store?: TrackingStore;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Constant-time string comparison using Node's crypto.timingSafeEqual.
 * Prevents timing-oracle attacks that leak token content via response latency.
 *
 * Returns false immediately when byte-lengths differ (length is not secret —
 * it's implicit in the protocol). Content comparison is always constant-time
 * regardless of where the first differing byte is.
 */
function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.byteLength !== bBuf.byteLength) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Sanitize a raw brand name derived from URL parsing.
 *
 * Defense-in-depth (OWASP A03): even though the URL is already validated by
 * `new URL()`, the derived brand name is used in prompts sent to AI engines
 * and potentially displayed in the UI. This guard ensures only safe chars
 * (alphanumeric + hyphen) survive and the length is bounded.
 *
 * Rules:
 *   - Strip any character not in [a-zA-Z0-9-]
 *   - Truncate to 50 characters
 *
 * @example
 *   sanitizeBrandName("Acme")           → "Acme"          (clean, unchanged)
 *   sanitizeBrandName("<script>xss")    → "scriptxss"     (angle brackets stripped)
 *   sanitizeBrandName("A".repeat(100))  → "A".repeat(50)  (truncated)
 */
export function sanitizeBrandName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 50);
}

/**
 * Derive a TrackingConfig from a brand URL.
 * Uses the standard demo prompt set; brand name + domain inferred from URL.
 * Throws TypeError on an invalid URL string.
 */
export function buildConfigFromUrl(rawUrl: string): TrackingConfig {
  const parsed = new URL(rawUrl); // throws TypeError on invalid input
  const hostname = parsed.hostname.replace(/^www\./, "");
  const [firstPart] = hostname.split(".");
  const rawBrandName =
    firstPart
      ? firstPart.charAt(0).toUpperCase() + firstPart.slice(1)
      : hostname;
  // Sanitize: strip non-alphanum/hyphen chars and cap at 50 chars (OWASP A03)
  const brandName = sanitizeBrandName(rawBrandName);
  return {
    brand: { name: brandName, domain: hostname, aliases: [hostname] },
    prompts: demoConfig.prompts,
  };
}

/**
 * Instantiate providers by name string.
 * Throws on unknown names or missing configuration (e.g. PERPLEXITY_API_KEY).
 */
export function buildProviders(names: string[]): AnswerEngineProvider[] {
  return names.map((name) => {
    switch (name) {
      case "mock":
        return new MockProvider({ engine: "mock" });
      case "perplexity":
        return new PerplexityProvider(); // throws if PERPLEXITY_API_KEY missing
      case "openai":
        return new OpenAIProvider(); // throws if OPENAI_API_KEY missing
      case "anthropic":
        return new AnthropicProvider(); // throws if ANTHROPIC_API_KEY missing
      case "gemini":
        return new GeminiProvider(); // throws if GEMINI_API_KEY/GOOGLE_API_KEY missing
      default:
        throw new Error(
          `Unknown provider: "${name}". Supported values: "mock", "perplexity", "openai", "anthropic", "gemini".`,
        );
    }
  });
}

/**
 * Validate + normalize an untrusted campaign payload into a {@link Campaign}.
 * Returns a typed error string instead of throwing, so the route maps it to 400.
 */
export function validateCampaign(input: unknown): { campaign: Campaign } | { error: string } {
  if (typeof input !== "object" || input === null) {
    return { error: "campaign must be an object" };
  }
  const c = input as Record<string, unknown>;
  if (typeof c["id"] !== "string" || !c["id"].trim()) return { error: "campaign.id is required" };
  if (typeof c["name"] !== "string" || !c["name"].trim()) return { error: "campaign.name is required" };

  const brand = c["brand"];
  if (typeof brand !== "object" || brand === null) return { error: "campaign.brand is required" };
  const brandName = (brand as Record<string, unknown>)["name"];
  if (typeof brandName !== "string" || !brandName.trim()) {
    return { error: "campaign.brand.name is required" };
  }

  const prompts = c["prompts"];
  if (!Array.isArray(prompts) || prompts.length === 0) {
    return { error: "campaign.prompts must be a non-empty array" };
  }
  const normPrompts = [];
  for (const p of prompts) {
    if (typeof p === "object" && p !== null && typeof (p as Record<string, unknown>)["prompt"] === "string") {
      const text = ((p as Record<string, unknown>)["prompt"] as string).trim();
      if (!text) return { error: "each prompt must have non-empty text" };
      const weight = (p as Record<string, unknown>)["weight"];
      normPrompts.push({ prompt: text, weight: typeof weight === "number" ? weight : undefined });
    } else {
      return { error: "each prompt must be { prompt: string, weight?: number }" };
    }
  }

  const campaign: Campaign = {
    id: c["id"] as string,
    name: c["name"] as string,
    brand: brand as Campaign["brand"],
    competitors: Array.isArray(c["competitors"]) ? (c["competitors"] as Campaign["competitors"]) : undefined,
    prompts: normPrompts,
    engines: Array.isArray(c["engines"]) ? (c["engines"] as string[]) : undefined,
  };
  return { campaign };
}

// ─── App factory ─────────────────────────────────────────────────────────────

/**
 * Create the Hono application.
 *
 * Exported (not just the default export) so tests can call
 * `app.request(new Request(...))` without spinning up a real TCP server.
 */
export function createApp(opts: AppOptions = {}) {
  const apiKey = opts.scanApiKey ?? process.env["SCAN_API_KEY"] ?? "";
  const limiter: RateLimiter = opts.rateLimiter ?? new InMemoryRateLimiter();
  const aegis: AegisGuard = opts.aegisGuard ?? createAegisGuard();
  const store: TrackingStore = opts.store ?? new InMemoryStore();
  const app = new Hono();

  /**
   * Shared auth + rate-limit gate. Returns a JSON Response to short-circuit
   * with, or null when the request may proceed. `T` keeps the envelope shape
   * (ScanResponse | CampaignResponse) honest at the call site.
   */
  function gate(
    c: Context,
    make: (error: string) => ScanResponse | CampaignResponse,
  ): Response | null {
    if (apiKey) {
      const authHeader = c.req.header("Authorization") ?? "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (!safeCompare(token, apiKey)) return c.json(make("Unauthorized"), 401);
    }
    const forwarded = c.req.header("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0]?.trim() || "unknown";
    if (!limiter.check(ip)) {
      return c.json(make("Rate limit exceeded. Max 10 requests per minute."), 429);
    }
    return null;
  }

  // ── Health check ────────────────────────────────────────────────────────────
  // No auth required — used by Railway healthcheckPath and load balancers.
  app.get("/health", (c) => {
    return c.json({ ok: true, version: VERSION, ts: Date.now() });
  });

  app.post("/api/scan", async (c) => {
    // ── 1. Auth ───────────────────────────────────────────────────────────────
    if (apiKey) {
      const authHeader = c.req.header("Authorization") ?? "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (!safeCompare(token, apiKey)) {
        return c.json({ ok: false, error: "Unauthorized" } satisfies ScanResponse, 401);
      }
    }

    // ── 2. Rate limit ─────────────────────────────────────────────────────────
    const forwarded = c.req.header("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0]?.trim() || "unknown";
    if (!limiter.check(ip)) {
      return c.json(
        { ok: false, error: "Rate limit exceeded. Max 10 requests per minute." } satisfies ScanResponse,
        429,
      );
    }

    // ── 3. Parse + validate body ──────────────────────────────────────────────
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "Invalid JSON body" } satisfies ScanResponse, 400);
    }

    if (typeof body !== "object" || body === null) {
      return c.json(
        { ok: false, error: "Request body must be a JSON object" } satisfies ScanResponse,
        400,
      );
    }

    const rawBody = body as Record<string, unknown>;
    const urlField = rawBody["url"];

    if (typeof urlField !== "string" || !urlField.trim()) {
      return c.json(
        { ok: false, error: "Missing required field: url (must be a non-empty string)" } satisfies ScanResponse,
        400,
      );
    }

    const providersField = rawBody["providers"];
    const providerNames: string[] =
      Array.isArray(providersField) && providersField.length > 0
        ? (providersField as string[])
        : ["mock"];

    // ── 3b. Aegis input guard ─────────────────────────────────────────────────
    // Scans the raw URL string for prompt injection and jailbreak patterns
    // before any business logic executes. Controlled by AEGIS_ENABLED env var
    // (or inject an enabled guard via AppOptions.aegisGuard for tests).
    // Error details are never forwarded to the caller (OWASP A03 info exposure).
    const aegisResult = await aegis.scan(urlField, { scope: "input" });
    if (!aegisResult.safe) {
      return c.json(
        {
          ok: false,
          error: `Input blocked: ${aegisResult.threatType ?? "UNKNOWN_THREAT"}`,
        } satisfies ScanResponse,
        400,
      );
    }

    // ── 4. Build TrackingConfig ───────────────────────────────────────────────
    let config: TrackingConfig;
    try {
      config = buildConfigFromUrl(urlField);
    } catch {
      return c.json(
        { ok: false, error: `Invalid URL: "${urlField}"` } satisfies ScanResponse,
        400,
      );
    }

    // ── 5. Build providers ────────────────────────────────────────────────────
    let providerInstances: AnswerEngineProvider[];
    try {
      providerInstances = buildProviders(providerNames);
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : String(err) } satisfies ScanResponse,
        400,
      );
    }

    // ── 6. Run scan ───────────────────────────────────────────────────────────
    try {
      const result = await runTracking(config, providerInstances);
      return c.json({ ok: true, result } satisfies ScanResponse);
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "Scan failed" } satisfies ScanResponse,
        500,
      );
    }
  });

  // ── POST /api/campaign ────────────────────────────────────────────────────
  // Run a campaign (prompt set × providers), persist the run to the store, and
  // return the run plus the full history + trend. Same auth + rate-limit gate.
  const campaignErr = (error: string): CampaignResponse => ({ ok: false, error });

  app.post("/api/campaign", async (c) => {
    const blocked = gate(c, campaignErr);
    if (blocked) return blocked;

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(campaignErr("Invalid JSON body"), 400);
    }
    if (typeof body !== "object" || body === null) {
      return c.json(campaignErr("Request body must be a JSON object"), 400);
    }
    const raw = body as Record<string, unknown>;

    // Resolve campaign + providers.
    let campaign: Campaign;
    let providerInstances: AnswerEngineProvider[];
    if (raw["useDemo"] === true && raw["campaign"] === undefined) {
      campaign = demoCampaign;
      providerInstances = demoProviders();
    } else {
      const validated = validateCampaign(raw["campaign"]);
      if ("error" in validated) return c.json(campaignErr(validated.error), 400);
      campaign = validated.campaign;

      // Screen the campaign's free-text inputs before any provider call.
      const probe = [campaign.brand.name, ...campaign.prompts.map((p) => p.prompt)].join("\n");
      const aegisResult = await aegis.scan(probe, { scope: "input" });
      if (!aegisResult.safe) {
        return c.json(campaignErr(`Input blocked: ${aegisResult.threatType ?? "UNKNOWN_THREAT"}`), 400);
      }

      const providersField = raw["providers"];
      const names = Array.isArray(providersField) && providersField.length > 0
        ? (providersField as string[])
        : ["mock"];
      try {
        providerInstances = buildProviders(names);
      } catch (err) {
        return c.json(campaignErr(err instanceof Error ? err.message : String(err)), 400);
      }
    }

    try {
      const run = await runCampaign(campaign, providerInstances);
      await store.saveCampaign(campaign);
      await store.recordRun(run);
      const history = await store.getRuns(campaign.id);
      return c.json({ ok: true, run, history, trend: computeTrend(history) } satisfies CampaignResponse);
    } catch (err) {
      return c.json(campaignErr(err instanceof Error ? err.message : "Campaign run failed"), 500);
    }
  });

  // ── GET /api/campaign/:id ─────────────────────────────────────────────────
  // Read-only history + trend for a persisted campaign.
  app.get("/api/campaign/:id", async (c) => {
    const blocked = gate(c, campaignErr);
    if (blocked) return blocked;
    const id = c.req.param("id");
    const history = await store.getRuns(id);
    return c.json({ ok: true, history, trend: computeTrend(history) } satisfies CampaignResponse);
  });

  return app;
}
