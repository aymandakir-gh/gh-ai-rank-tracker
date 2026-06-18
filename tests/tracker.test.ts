import { describe, it, expect } from "vitest";
import { runTracking, buildRecommendations } from "../src/tracker";
import { MockProvider, type AnswerEngineProvider } from "../src/providers";
import { demoConfig, demoProviders } from "../src/demo";
import type { TrackingConfig } from "../src/types";

const FIXED = () => new Date("2026-06-08T00:00:00.000Z");

describe("runTracking (demo)", () => {
  it("produces a well-formed report with a deterministic timestamp", async () => {
    const report = await runTracking(demoConfig, demoProviders(), { now: FIXED });
    expect(report.brand).toBe("GrowthHackers");
    expect(report.generatedAt).toBe("2026-06-08T00:00:00.000Z");
    expect(report.engines).toEqual(["perplexity", "chatgpt"]);
    expect(report.visibilityScore).toBeGreaterThan(0);
    expect(report.visibilityScore).toBeLessThanOrEqual(100);
    expect(report.prompts).toHaveLength(demoConfig.prompts.length);
  });

  it("identifies prompts where the brand is invisible across all engines", async () => {
    const report = await runTracking(demoConfig, demoProviders(), { now: FIXED });
    expect(report.gaps).toContain("what is generative engine optimization (GEO)");
    expect(report.gaps).toContain("tools to measure brand visibility in ChatGPT and Perplexity");
    expect(report.gaps).toHaveLength(2);
  });

  it("computes share of voice including competitors", async () => {
    const report = await runTracking(demoConfig, demoProviders(), { now: FIXED });
    const brands = report.shareOfVoice.map((s) => s.brand);
    expect(brands).toContain("GrowthHackers");
    expect(brands).toContain("HubSpot");
    expect(brands).toContain("Semrush");
    expect(report.recommendations.length).toBeGreaterThan(0);
  });
});

describe("runTracking (controlled)", () => {
  it("scores a fully-covered brand near the top", async () => {
    const config: TrackingConfig = {
      brand: { name: "Acme", domain: "acme.com" },
      prompts: [{ prompt: "best widget vendor" }],
    };
    const provider = new MockProvider({
      script: {
        "best widget vendor": {
          text: "Acme is the best widget vendor by far.",
          citations: [{ url: "https://acme.com" }],
        },
      },
    });
    const report = await runTracking(config, [provider], { now: FIXED });
    expect(report.visibilityScore).toBe(100);
    expect(report.gaps).toHaveLength(0);
    expect(report.coverage.mentionRate).toBe(1);
    expect(report.coverage.citationRate).toBe(1);
  });

  it("throws on empty providers or empty prompts", async () => {
    await expect(runTracking(demoConfig, [])).rejects.toThrow(/at least one provider/);
    await expect(
      runTracking({ ...demoConfig, prompts: [] }, demoProviders()),
    ).rejects.toThrow(/prompts is empty/);
  });
});

describe("buildRecommendations", () => {
  it("flags high severity for low visibility", () => {
    const recs = buildRecommendations(
      "Acme",
      10,
      { totalPrompts: 4, totalResponses: 8, mentionRate: 0.25, citationRate: 0.2 },
      ["q1", "q2"],
      [{ brand: "Acme", presence: 1, mentions: 1, share: 1 }],
    );
    expect(recs.some((r) => r.severity === "high")).toBe(true);
  });

  it("flags a competitor leading share of voice", () => {
    const recs = buildRecommendations(
      "Acme",
      70,
      { totalPrompts: 4, totalResponses: 8, mentionRate: 1, citationRate: 1 },
      [],
      [
        { brand: "Rival", presence: 4, mentions: 6, share: 0.8 },
        { brand: "Acme", presence: 1, mentions: 1, share: 0.2 },
      ],
    );
    expect(recs.some((r) => /Rival leads share-of-voice/.test(r.message))).toBe(true);
  });
});

describe("runTracking (partial provider failure)", () => {
  const config: TrackingConfig = {
    brand: { name: "Acme", domain: "acme.com" },
    prompts: [{ prompt: "best widget vendor" }],
  };
  const working = () =>
    new MockProvider({
      engine: "perplexity",
      script: {
        "best widget vendor": {
          text: "Acme is the best widget vendor by far.",
          citations: [{ url: "https://acme.com" }],
        },
      },
    });
  const failing = (engine: string): AnswerEngineProvider => ({
    engine,
    query: async () => {
      throw new Error("upstream down");
    },
  });

  it("keeps the engines that succeeded when one provider fails (not all-or-nothing)", async () => {
    const report = await runTracking(config, [working(), failing("chatgpt")], { now: FIXED });
    // The working engine's result survived a sibling failure...
    expect(report.visibilityScore).toBeGreaterThan(0);
    // ...and only the successful engine contributed a response.
    expect(report.prompts[0].byEngine).toHaveLength(1);
  });

  it("throws only when every provider fails", async () => {
    await expect(
      runTracking(config, [failing("perplexity"), failing("chatgpt")], { now: FIXED }),
    ).rejects.toThrow(/every provider query failed/);
  });
});
