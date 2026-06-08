import { describe, it, expect } from "vitest";
import {
  scoreResponse,
  aggregatePrompt,
  overallScore,
  coverage,
  shareOfVoice,
  maxWeight,
  DEFAULT_WEIGHTS,
} from "../src/score";
import type { Brand, EngineResponse, PromptScore } from "../src/types";

const GH: Brand = { name: "GrowthHackers", aliases: ["GH"], domain: "growthackers.io" };

function resp(text: string, citations: { url: string }[] = []): EngineResponse {
  return { engine: "mock", prompt: "p", text, citations };
}

describe("scoreResponse", () => {
  it("gives a perfect 100 for a leading mention + top citation", () => {
    const r = scoreResponse(resp("GrowthHackers is great.", [{ url: "https://growthackers.io" }]), GH);
    expect(r.score).toBe(100);
  });

  it("gives 0 when neither mentioned nor cited", () => {
    const r = scoreResponse(resp("Nothing relevant here."), GH);
    expect(r.score).toBe(0);
    expect(r.mention.mentioned).toBe(false);
    expect(r.citation.cited).toBe(false);
  });

  it("scores citation-only at the citation weight (45)", () => {
    const r = scoreResponse(resp("Several agencies exist.", [{ url: "https://growthackers.io" }]), GH);
    expect(r.mention.mentioned).toBe(false);
    expect(r.citation.cited).toBe(true);
    expect(r.score).toBe(45); // citationPresence 30 + citationProminence 15 * 1
  });

  it("scores mention-only below a mention+citation response", () => {
    const mentionOnly = scoreResponse(resp("People recommend GrowthHackers a lot."), GH);
    const both = scoreResponse(
      resp("People recommend GrowthHackers a lot.", [{ url: "https://growthackers.io" }]),
      GH,
    );
    expect(mentionOnly.mention.mentioned).toBe(true);
    expect(mentionOnly.citation.cited).toBe(false);
    expect(both.score).toBeGreaterThan(mentionOnly.score);
  });
});

describe("weights", () => {
  it("default weights sum to 100", () => {
    expect(maxWeight(DEFAULT_WEIGHTS)).toBe(100);
  });
});

describe("aggregatePrompt", () => {
  it("averages engine scores and flags presence across engines", () => {
    const responses = [
      { engine: "a", prompt: "p", text: "GrowthHackers wins.", citations: [{ url: "https://growthackers.io" }] },
      { engine: "b", prompt: "p", text: "No mention at all.", citations: [] },
    ];
    const ps = aggregatePrompt("p", 1, responses, GH);
    const expected = (ps.byEngine[0]!.score + ps.byEngine[1]!.score) / 2;
    expect(ps.score).toBeCloseTo(Math.round(expected * 10) / 10, 5);
    expect(ps.mentionedAnywhere).toBe(true);
    expect(ps.citedAnywhere).toBe(true);
  });
});

describe("overallScore", () => {
  it("weights prompts by their weight", () => {
    const prompts = [
      { score: 80, weight: 2 },
      { score: 20, weight: 1 },
    ] as PromptScore[];
    expect(overallScore(prompts)).toBe(60); // (80*2 + 20*1) / 3
  });
  it("returns 0 when total weight is 0", () => {
    expect(overallScore([{ score: 50, weight: 0 }] as PromptScore[])).toBe(0);
  });
});

describe("coverage", () => {
  it("computes mention and citation rates", () => {
    const prompts = [
      { byEngine: [{}, {}], mentionedAnywhere: true, citedAnywhere: true },
      { byEngine: [{}, {}], mentionedAnywhere: true, citedAnywhere: false },
      { byEngine: [{}], mentionedAnywhere: false, citedAnywhere: false },
    ] as unknown as PromptScore[];
    const c = coverage(prompts);
    expect(c.totalPrompts).toBe(3);
    expect(c.totalResponses).toBe(5);
    expect(c.mentionRate).toBeCloseTo(0.67, 2);
    expect(c.citationRate).toBeCloseTo(0.33, 2);
  });
});

describe("shareOfVoice", () => {
  it("ranks brands by presence and computes shares that sum to ~1", () => {
    const responses = [resp("GrowthHackers and HubSpot."), resp("HubSpot wins again.")];
    const brands: Brand[] = [GH, { name: "HubSpot" }, { name: "Semrush" }];
    const sov = shareOfVoice(responses, brands);
    expect(sov[0]!.brand).toBe("HubSpot");
    expect(sov[0]!.presence).toBe(2);
    expect(sov.find((s) => s.brand === "GrowthHackers")!.presence).toBe(1);
    expect(sov.find((s) => s.brand === "Semrush")!.presence).toBe(0);
    const sum = sov.reduce((s, e) => s + e.share, 0);
    expect(sum).toBeCloseTo(1, 1);
  });

  it("returns all-zero shares when nobody is mentioned", () => {
    const sov = shareOfVoice([resp("totally unrelated text")], [GH]);
    expect(sov[0]!.share).toBe(0);
  });
});
