import { describe, it, expect } from "vitest";
import { renderMarkdown, renderConsole } from "../src/report";
import type { TrackingReport } from "../src/types";

function report(over: Partial<TrackingReport> = {}): TrackingReport {
  return {
    brand: "Acme",
    generatedAt: "2026-06-08T00:00:00.000Z",
    engines: ["mock"],
    visibilityScore: 50,
    coverage: { totalPrompts: 1, totalResponses: 1, mentionRate: 1, citationRate: 0 },
    prompts: [
      { prompt: "p1", weight: 1, score: 50, mentionedAnywhere: true, citedAnywhere: false, byEngine: [] },
    ],
    gaps: [],
    shareOfVoice: [{ brand: "Acme", presence: 1, mentions: 1, share: 1 }],
    recommendations: [{ severity: "low", message: "do the thing" }],
    ...over,
  };
}

describe("renderMarkdown", () => {
  it("renders the core sections", () => {
    const md = renderMarkdown(report());
    expect(md).toContain("# AI Visibility Report — Acme");
    expect(md).toContain("## Prompt breakdown");
    expect(md).toContain("## Share of voice");
    expect(md).toContain("## Recommendations");
  });

  it("collapses newlines in heading, gaps and recommendations (no split lines)", () => {
    // Regression for the v1 fix-verification finding: only table cells were
    // newline-safe; the heading/gaps/recs interpolated raw user text.
    const md = renderMarkdown(
      report({
        brand: "Evil\nCorp",
        gaps: ["best\nwidget | vendor"],
        recommendations: [{ severity: "high", message: "fix\nyour\ncontent" }],
      }),
    );
    const lines = md.split("\n");
    expect(lines).toContain("# AI Visibility Report — Evil Corp");
    // Gap list item stays on one line.
    expect(lines).toContain("- best widget | vendor");
    expect(lines.some((l) => l.startsWith("widget | vendor"))).toBe(false);
    // Recommendation stays on one line.
    expect(lines.some((l) => l.includes("[HIGH]** fix your content"))).toBe(true);
  });

  it("escapes pipes and collapses newlines in prompt table cells", () => {
    const md = renderMarkdown(
      report({
        prompts: [
          { prompt: "a\nb | c", weight: 1, score: 10, mentionedAnywhere: false, citedAnywhere: false, byEngine: [] },
        ],
      }),
    );
    const row = md.split("\n").find((l) => l.includes("a b"));
    expect(row).toMatch(/^\| a b \\\| c \|/);
  });
});

describe("renderConsole", () => {
  it("renders a compact score + prompt summary", () => {
    const out = renderConsole(report());
    expect(out).toContain("AI Visibility Report — Acme");
    expect(out).toContain("Score: 50/100");
    expect(out).toContain("p1");
  });
});
