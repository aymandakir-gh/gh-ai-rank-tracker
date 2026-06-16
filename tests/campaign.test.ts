import { describe, it, expect } from "vitest";
import {
  runCampaign,
  engineBreakdown,
  competitorComparison,
  type Campaign,
} from "../src/campaign";
import { MockProvider } from "../src/providers";
import { demoCampaign, demoProvidersForWeek } from "../src/demo";

const FIXED = () => new Date("2026-06-08T00:00:00.000Z");

/**
 * Controlled two-engine, two-prompt campaign:
 *   e1/p1 → Acme mentioned + cited      e1/p2 → Rival only
 *   e2/p1 → Acme mentioned (no cite)    e2/p2 → nobody
 * Brand mention presence: Acme 2 (e1p1,e2p1), Rival 1 (e1p2).
 */
const campaign: Campaign = {
  id: "acme-test",
  name: "Acme test",
  brand: { name: "Acme", domain: "acme.com" },
  competitors: [{ name: "Rival", domain: "rival.com" }],
  prompts: [{ prompt: "p1", weight: 1 }, { prompt: "p2", weight: 1 }],
  engines: ["e1", "e2"],
};

function controlledProviders() {
  const e1 = new MockProvider({
    engine: "e1",
    script: {
      p1: { text: "Acme leads here.", citations: [{ url: "https://acme.com/x" }] },
      p2: { text: "Rival is the pick.", citations: [{ url: "https://rival.com/y" }] },
    },
  });
  const e2 = new MockProvider({
    engine: "e2",
    script: {
      p1: { text: "Acme is solid, no link.", citations: [] },
      p2: { text: "Nothing relevant here.", citations: [] },
    },
  });
  return [e1, e2];
}

describe("runCampaign", () => {
  it("assembles a CampaignRun with report + engine breakdown + competitor comparison", async () => {
    const run = await runCampaign(campaign, controlledProviders(), {
      now: FIXED,
      idFactory: () => "run_1",
    });
    expect(run.campaignId).toBe("acme-test");
    expect(run.runId).toBe("run_1");
    expect(run.generatedAt).toBe("2026-06-08T00:00:00.000Z");
    expect(run.brand).toBe("Acme");
    expect(run.visibilityScore).toBe(run.report.visibilityScore);
    expect(run.report.prompts).toHaveLength(2);
    expect(run.report.engines).toEqual(["e1", "e2"]);
  });

  it("uses a unique non-colliding default runId when none is injected", async () => {
    const a = await runCampaign(campaign, controlledProviders(), { now: FIXED });
    const b = await runCampaign(campaign, controlledProviders(), { now: FIXED });
    expect(a.runId).toMatch(/^run_\d+_[a-z0-9]+$/);
    expect(a.runId).not.toBe(b.runId);
  });

  it("aggregates share-of-voice across all prompts × engines (not a single query)", async () => {
    const run = await runCampaign(campaign, controlledProviders(), {
      now: FIXED,
      idFactory: () => "run_1",
    });
    const acme = run.report.shareOfVoice.find((s) => s.brand === "Acme");
    const rival = run.report.shareOfVoice.find((s) => s.brand === "Rival");
    // Acme is present in 2 responses (e1/p1, e2/p1); Rival in 1 (e1/p2).
    expect(acme?.presence).toBe(2);
    expect(rival?.presence).toBe(1);
    expect(acme!.share).toBeGreaterThan(rival!.share);
  });
});

describe("engineBreakdown", () => {
  it("computes per-engine mention/citation rates and scores in stable order", async () => {
    const run = await runCampaign(campaign, controlledProviders(), {
      now: FIXED,
      idFactory: () => "run_1",
    });
    const eb = engineBreakdown(run.report);
    expect(eb.map((e) => e.engine)).toEqual(["e1", "e2"]);

    const e1 = eb.find((e) => e.engine === "e1")!;
    const e2 = eb.find((e) => e.engine === "e2")!;
    // e1: Acme mentioned in 1/2 prompts, cited in 1/2.
    expect(e1.mentionRate).toBe(0.5);
    expect(e1.citationRate).toBe(0.5);
    expect(e1.responses).toBe(2);
    // e2: Acme mentioned in 1/2 prompts, cited in 0/2.
    expect(e2.mentionRate).toBe(0.5);
    expect(e2.citationRate).toBe(0);
    // The engine that also earns a citation scores strictly higher.
    expect(e1.score).toBeGreaterThan(e2.score);
  });

  it("emits a zeroed row for an engine with no responses", () => {
    const eb = engineBreakdown({
      brand: "Acme",
      generatedAt: "2026-06-08T00:00:00.000Z",
      engines: ["ghost"],
      visibilityScore: 0,
      coverage: { totalPrompts: 0, totalResponses: 0, mentionRate: 0, citationRate: 0 },
      prompts: [],
      gaps: [],
      shareOfVoice: [],
      recommendations: [],
    });
    expect(eb).toEqual([
      { engine: "ghost", score: 0, mentionRate: 0, citationRate: 0, responses: 0 },
    ]);
  });
});

describe("competitorComparison", () => {
  it("tags the tracked brand and computes SoV gaps versus it", async () => {
    const run = await runCampaign(campaign, controlledProviders(), {
      now: FIXED,
      idFactory: () => "run_1",
    });
    const cc = competitorComparison(run.report);
    const acme = cc.find((c) => c.brand === "Acme")!;
    const rival = cc.find((c) => c.brand === "Rival")!;

    expect(acme.isTracked).toBe(true);
    expect(acme.gapVsTracked).toBe(0);
    expect(rival.isTracked).toBe(false);
    // Acme leads, so the competitor's gap-vs-tracked is positive.
    expect(rival.gapVsTracked).toBeGreaterThan(0);
    expect(rival.gapVsTracked).toBeCloseTo(acme.shareOfVoice - rival.shareOfVoice, 5);
  });
});

describe("demo campaign history coverage", () => {
  it("grows GrowthHackers coverage week over week (rising visibility)", async () => {
    const week0 = await runCampaign(demoCampaign, demoProvidersForWeek(0), {
      now: FIXED,
      idFactory: () => "w0",
    });
    const week3 = await runCampaign(demoCampaign, demoProvidersForWeek(3), {
      now: FIXED,
      idFactory: () => "w3",
    });
    expect(week3.visibilityScore).toBeGreaterThan(week0.visibilityScore);
    const sov0 = week0.competitorComparison.find((c) => c.isTracked)!.shareOfVoice;
    const sov3 = week3.competitorComparison.find((c) => c.isTracked)!.shareOfVoice;
    expect(sov3).toBeGreaterThan(sov0);
  });
});
