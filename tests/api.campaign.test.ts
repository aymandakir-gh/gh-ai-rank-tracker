import { describe, it, expect } from "vitest";
import {
  createApp,
  validateCampaign,
  type RateLimiter,
  type CampaignResponse,
} from "../src/api/scan";
import { InMemoryStore } from "../src/store";
import type { Campaign } from "../src/campaign";

const allowAll: RateLimiter = { check: () => true };
const blockAll: RateLimiter = { check: () => false };

const sampleCampaign: Campaign = {
  id: "acme-geo",
  name: "Acme GEO",
  brand: { name: "Acme", domain: "acme.com" },
  competitors: [{ name: "Rival", domain: "rival.com" }],
  prompts: [{ prompt: "best widget vendors", weight: 2 }],
};

function postCampaign(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/campaign", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// ─── validateCampaign (pure) ────────────────────────────────────────────────

describe("validateCampaign", () => {
  it("accepts a well-formed campaign and normalizes prompts", () => {
    const r = validateCampaign({
      id: "c",
      name: "C",
      brand: { name: "Acme" },
      prompts: [{ prompt: "  hi  ", weight: 3 }, { prompt: "yo" }],
    });
    expect("campaign" in r).toBe(true);
    if ("campaign" in r) {
      expect(r.campaign.prompts).toEqual([
        { prompt: "hi", weight: 3 },
        { prompt: "yo", weight: undefined },
      ]);
    }
  });

  it.each([
    [{}, /campaign.id is required/],
    [{ id: "c" }, /campaign.name is required/],
    [{ id: "c", name: "C" }, /campaign.brand is required/],
    [{ id: "c", name: "C", brand: {} }, /campaign.brand.name is required/],
    [{ id: "c", name: "C", brand: { name: "A" }, prompts: [] }, /non-empty array/],
    [{ id: "c", name: "C", brand: { name: "A" }, prompts: [{}] }, /each prompt must be/],
  ])("rejects %o", (input, re) => {
    const r = validateCampaign(input);
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error).toMatch(re as RegExp);
  });
});

// ─── POST /api/campaign ──────────────────────────────────────────────────────

describe("POST /api/campaign", () => {
  it("runs the demo campaign and returns run + history + trend", async () => {
    const app = createApp({ scanApiKey: "", rateLimiter: allowAll, store: new InMemoryStore() });
    const res = await app.request(postCampaign({ useDemo: true }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as CampaignResponse;
    expect(json.ok).toBe(true);
    expect(json.run?.campaignId).toBe("demo-growthhackers");
    expect(json.run?.visibilityScore).toBeGreaterThan(0);
    expect(json.history).toHaveLength(1);
    expect(json.trend?.points).toHaveLength(1);
  });

  it("persists across requests — a second run grows the history + trend", async () => {
    const store = new InMemoryStore();
    const app = createApp({ scanApiKey: "", rateLimiter: allowAll, store });
    await app.request(postCampaign({ campaign: sampleCampaign }));
    const res2 = await app.request(postCampaign({ campaign: sampleCampaign }));
    const json = (await res2.json()) as CampaignResponse;
    expect(json.history).toHaveLength(2);
    expect(json.trend?.points).toHaveLength(2);
  });

  it("computes competitor comparison for the run", async () => {
    const app = createApp({ scanApiKey: "", rateLimiter: allowAll, store: new InMemoryStore() });
    const res = await app.request(postCampaign({ campaign: sampleCampaign }));
    const json = (await res.json()) as CampaignResponse;
    const brands = json.run?.competitorComparison.map((c) => c.brand);
    expect(brands).toContain("Acme");
    expect(brands).toContain("Rival");
    expect(json.run?.competitorComparison.find((c) => c.brand === "Acme")?.isTracked).toBe(true);
  });

  it("rejects an invalid campaign with 400", async () => {
    const app = createApp({ scanApiKey: "", rateLimiter: allowAll, store: new InMemoryStore() });
    const res = await app.request(postCampaign({ campaign: { id: "x" } }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as CampaignResponse;
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/name is required/);
  });

  it("rejects an unknown provider with 400", async () => {
    const app = createApp({ scanApiKey: "", rateLimiter: allowAll, store: new InMemoryStore() });
    const res = await app.request(postCampaign({ campaign: sampleCampaign, providers: ["bogus"] }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as CampaignResponse;
    expect(json.error).toMatch(/Unknown provider/);
  });

  it("enforces auth and rate-limit on the campaign endpoint", async () => {
    const authed = createApp({ scanApiKey: "secret", rateLimiter: allowAll, store: new InMemoryStore() });
    const unauth = await authed.request(postCampaign({ useDemo: true }));
    expect(unauth.status).toBe(401);

    const limited = createApp({ scanApiKey: "", rateLimiter: blockAll, store: new InMemoryStore() });
    const blocked = await limited.request(postCampaign({ useDemo: true }));
    expect(blocked.status).toBe(429);
  });
});

// ─── GET /api/campaign/:id ────────────────────────────────────────────────────

describe("GET /api/campaign/:id", () => {
  it("returns persisted history + trend for a campaign", async () => {
    const store = new InMemoryStore();
    const app = createApp({ scanApiKey: "", rateLimiter: allowAll, store });
    await app.request(postCampaign({ campaign: sampleCampaign }));
    await app.request(postCampaign({ campaign: sampleCampaign }));

    const res = await app.request(new Request("http://localhost/api/campaign/acme-geo"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as CampaignResponse;
    expect(json.ok).toBe(true);
    expect(json.history).toHaveLength(2);
    expect(json.trend?.brand).toBe("Acme");
  });

  it("returns an empty history for an unknown campaign", async () => {
    const app = createApp({ scanApiKey: "", rateLimiter: allowAll, store: new InMemoryStore() });
    const res = await app.request(new Request("http://localhost/api/campaign/nope"));
    const json = (await res.json()) as CampaignResponse;
    expect(json.ok).toBe(true);
    expect(json.history).toEqual([]);
    expect(json.trend?.points).toEqual([]);
  });
});
