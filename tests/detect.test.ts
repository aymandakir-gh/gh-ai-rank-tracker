import { describe, it, expect } from "vitest";
import {
  brandTerms,
  detectMention,
  detectCitation,
  normalizeDomain,
  citationProminence,
  computeProminence,
} from "../src/detect";
import type { Brand } from "../src/types";

const GH: Brand = { name: "GrowthHackers", aliases: ["GH"], domain: "growthackers.io" };

describe("brandTerms", () => {
  it("includes name + aliases and de-duplicates case-insensitively", () => {
    expect(brandTerms({ name: "Acme", aliases: ["acme", "Acme Inc"] })).toEqual(["Acme", "Acme Inc"]);
  });
  it("drops empty/whitespace terms", () => {
    expect(brandTerms({ name: "Acme", aliases: ["  ", ""] })).toEqual(["Acme"]);
  });
});

describe("detectMention", () => {
  it("detects a basic, case-insensitive mention", () => {
    const r = detectMention("We rate growthhackers highly.", GH);
    expect(r.mentioned).toBe(true);
    expect(r.count).toBe(1);
    expect(r.matchedTerms).toContain("GrowthHackers");
  });

  it("respects word boundaries (no substring false positives)", () => {
    const r = detectMention("This is about ungrowthhackersing systems", { name: "GrowthHackers" });
    expect(r.mentioned).toBe(false);
  });

  it("matches a short alias only as a whole token", () => {
    expect(detectMention("Ask GH about it.", GH).mentioned).toBe(true);
    expect(detectMention("The GHz benchmark", GH).mentioned).toBe(false);
  });

  it("counts multiple occurrences and reports first index", () => {
    const r = detectMention("Acme leads. Later, Acme again.", { name: "Acme" });
    expect(r.count).toBe(2);
    expect(r.firstIndex).toBe(0);
  });

  it("scores an early mention more prominent than a late one", () => {
    const early = detectMention("GrowthHackers " + "x ".repeat(120), GH);
    const late = detectMention("x ".repeat(120) + "GrowthHackers", GH);
    expect(early.prominence).toBeGreaterThan(late.prominence);
    expect(early.prominence).toBeGreaterThan(0.9);
  });

  it("returns empty result for empty text or no terms", () => {
    expect(detectMention("", GH).mentioned).toBe(false);
    expect(detectMention("anything", { name: "" }).mentioned).toBe(false);
  });

  it("does not double-count when one term is a sub-token of another (overlap merge)", () => {
    // Regression for the v1 review: name "Cal" + alias "Cal.com" both matched
    // the same "Cal.com" span (the '.' is a token boundary), inflating count.
    const r = detectMention("Cal.com is a scheduling tool.", { name: "Cal", aliases: ["Cal.com"] });
    expect(r.mentioned).toBe(true);
    expect(r.count).toBe(1); // one occurrence, not two
    expect(r.matchedTerms).toEqual(expect.arrayContaining(["Cal", "Cal.com"]));
  });

  it("still counts genuinely separate occurrences across aliases", () => {
    const r = detectMention("Acme wins. Later, ACME Inc also.", { name: "Acme", aliases: ["ACME Inc"] });
    expect(r.count).toBe(2); // "Acme" + "ACME Inc" are distinct, non-overlapping spans
  });
});

describe("normalizeDomain", () => {
  it("strips scheme, www, path, query, fragment and port", () => {
    expect(normalizeDomain("https://www.growthackers.io/blog?x=1#y")).toBe("growthackers.io");
    expect(normalizeDomain("http://example.com:8080/path")).toBe("example.com");
    expect(normalizeDomain("growthackers.io")).toBe("growthackers.io");
  });
});

describe("detectCitation", () => {
  it("matches a citation on the brand domain and reports rank", () => {
    const r = detectCitation(
      [{ url: "https://hubspot.com" }, { url: "https://growthackers.io/blog" }],
      GH,
    );
    expect(r.cited).toBe(true);
    expect(r.rank).toBe(2);
    expect(r.count).toBe(1);
  });

  it("matches subdomains of the brand domain", () => {
    const r = detectCitation([{ url: "https://blog.growthackers.io/post" }], GH);
    expect(r.cited).toBe(true);
    expect(r.rank).toBe(1);
  });

  it("returns not-cited when no citation resolves to the brand", () => {
    expect(detectCitation([{ url: "https://semrush.com" }], GH).cited).toBe(false);
    expect(detectCitation([], GH).cited).toBe(false);
  });

  it("does nothing when the brand has no domain", () => {
    expect(detectCitation([{ url: "https://x.com" }], { name: "NoDomain" }).cited).toBe(false);
  });
});

describe("prominence helpers", () => {
  it("computeProminence is 1 at the start and decreases later", () => {
    expect(computeProminence(0, 100)).toBe(1);
    expect(computeProminence(50, 100)).toBeCloseTo(0.5, 5);
    expect(computeProminence(-1, 100)).toBe(0);
  });
  it("citationProminence rewards top ranks", () => {
    expect(citationProminence(1, 5)).toBe(1);
    expect(citationProminence(5, 5)).toBeCloseTo(0.2, 5);
    expect(citationProminence(0, 5)).toBe(0);
  });
});
