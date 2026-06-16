import { describe, it, expect } from "vitest";
import { renderCampaignMarkdown } from "../src/export/markdown";
import {
  renderCampaignPdf,
  buildTextPdf,
  sanitizeAscii,
  escapePdfText,
  type PdfLine,
} from "../src/export/pdf";
import { runCampaign, type Campaign } from "../src/campaign";
import { computeTrend } from "../src/trends";
import { MockProvider } from "../src/providers";

const FIXED = () => new Date("2026-06-08T00:00:00.000Z");

const campaign: Campaign = {
  id: "acme",
  name: "Acme GEO Q2",
  brand: { name: "Acme", domain: "acme.com" },
  competitors: [{ name: "Rival", domain: "rival.com" }],
  prompts: [{ prompt: "best widget vendor" }, { prompt: "top widget tools" }],
  engines: ["e1"],
};

function providers() {
  return [
    new MockProvider({
      engine: "e1",
      script: {
        "best widget vendor": { text: "Acme is the best widget vendor.", citations: [{ url: "https://acme.com" }] },
        "top widget tools": { text: "Rival makes good widgets.", citations: [{ url: "https://rival.com" }] },
      },
    }),
  ];
}

async function makeRun() {
  return runCampaign(campaign, providers(), { now: FIXED, idFactory: () => "r1" });
}

// ─── Markdown ───────────────────────────────────────────────────────────────

describe("renderCampaignMarkdown", () => {
  it("includes the brand, score, every section, and per-prompt rows", async () => {
    const run = await makeRun();
    const md = renderCampaignMarkdown(run, computeTrend([run]), campaign.name);

    expect(md).toContain("# AI Visibility Report — Acme");
    expect(md).toContain("**Campaign:** Acme GEO Q2");
    expect(md).toContain(`**AI Visibility Score:** ${run.visibilityScore}/100`);
    expect(md).toContain("## Share of voice over time");
    expect(md).toContain("## Per-engine breakdown");
    expect(md).toContain("## Competitor comparison");
    expect(md).toContain("## Per-prompt drill-down");
    expect(md).toContain("Acme (you)");
    expect(md).toContain("Rival");
    expect(md).toContain("best widget vendor");
    expect(md).toContain("top widget tools");
  });

  it("keeps cells/headings on one line when values contain newlines or pipes", async () => {
    // Regression for the v1 review: escapePipe only escaped '|', so a newline in
    // a prompt/brand/campaign value split a table row or heading.
    const run = await runCampaign(
      {
        id: "x",
        name: "X",
        brand: { name: "Acme\nCorp", domain: "acme.com" },
        prompts: [{ prompt: "multi\nline | pipe" }],
        engines: ["e1"],
      },
      [new MockProvider({ engine: "e1", script: {} })],
      { now: FIXED, idFactory: () => "r1" },
    );
    const md = renderCampaignMarkdown(run, computeTrend([run]), "Name\nWithBreak");
    const lines = md.split("\n");

    // Heading: brand newline collapsed → no orphan "Corp" line.
    expect(lines).toContain("# AI Visibility Report — Acme Corp");
    expect(lines).toContain("**Campaign:** Name WithBreak");
    // Prompt cell: newline collapsed to a space, pipe escaped, row intact.
    const promptRow = lines.find((l) => l.includes("multi line"));
    expect(promptRow).toMatch(/^\| multi line \\\| pipe \|/);
    // No stray fragment line beginning with the broken tail.
    expect(lines.some((l) => l.startsWith("line | pipe"))).toBe(false);
  });

  it("shows the first→last delta line only with multiple runs", async () => {
    const run = await makeRun();
    expect(renderCampaignMarkdown(run, computeTrend([run]))).not.toContain("Since first run");

    const earlier = await runCampaign(
      { ...campaign, prompts: [{ prompt: "top widget tools" }] }, // Acme absent → lower
      providers(),
      { now: () => new Date("2026-06-01T00:00:00.000Z"), idFactory: () => "r0" },
    );
    const md = renderCampaignMarkdown(run, computeTrend([earlier, run]), campaign.name);
    expect(md).toContain("Since first run");
  });
});

// ─── PDF: low-level structure ──────────────────────────────────────────────────

function pdfText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("latin1");
}

describe("buildTextPdf — structure", () => {
  it("emits a valid PDF header and trailer", () => {
    const text = pdfText(buildTextPdf([{ text: "Hello PDF" }]));
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("/BaseFont /Helvetica");
    expect(text).toContain("(Hello PDF) Tj");
  });

  it("writes a cross-reference table whose offsets point at the real objects", () => {
    const bytes = buildTextPdf([
      { text: "Title", size: 18, bold: true },
      { text: "Body line" },
    ]);
    const text = pdfText(bytes);

    // startxref → xref location
    const m = text.match(/startxref\s+(\d+)\s+%%EOF/);
    expect(m).not.toBeNull();
    const xrefOff = Number(m![1]);
    const xref = text.slice(xrefOff);
    expect(xref.startsWith("xref\n")).toBe(true);

    // Parse "xref\n0 <count>\n" then the fixed-width 20-byte entries.
    const head = xref.match(/^xref\n0 (\d+)\n/)!;
    const count = Number(head[1]);
    const entriesStart = xrefOff + head[0].length;
    for (let i = 1; i < count; i++) {
      const entry = text.slice(entriesStart + i * 20, entriesStart + i * 20 + 20);
      expect(entry).toMatch(/^\d{10} \d{5} n /); // well-formed in-use entry
      const off = Number(entry.slice(0, 10));
      // The byte at that offset must begin object `i`.
      expect(text.slice(off)).toMatch(new RegExp(`^${i} 0 obj`));
    }

    // Trailer references the catalog and the right object count.
    expect(text).toContain(`/Size ${count}`);
    expect(text).toContain("/Root 1 0 R");
  });

  it("paginates long content across multiple pages", () => {
    const lines: PdfLine[] = Array.from({ length: 120 }, (_, i) => ({ text: `Line ${i}`, size: 12 }));
    const text = pdfText(buildTextPdf(lines));
    const count = Number(text.match(/\/Count (\d+)/)![1]);
    expect(count).toBeGreaterThan(1);
    // Kids array lists one ref per page.
    const kids = text.match(/\/Kids \[([^\]]*)\]/)![1]!;
    expect(kids.trim().split(/\s+0 R/).filter(Boolean)).toHaveLength(count);
  });

  it("Length on each content stream matches its stream bytes", () => {
    const text = pdfText(buildTextPdf([{ text: "Measure me" }]));
    const m = text.match(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/)!;
    expect(Number(m[1])).toBe(m[2]!.length);
  });
});

// ─── PDF: campaign report ──────────────────────────────────────────────────────

describe("renderCampaignPdf", () => {
  it("embeds the brand name, score and section labels", async () => {
    const run = await makeRun();
    const text = pdfText(renderCampaignPdf(run, computeTrend([run]), campaign.name));
    expect(text).toContain("AI Visibility Report - Acme");
    expect(text).toContain(`AI Visibility Score: ${run.visibilityScore}/100`);
    expect(text).toContain("Per-engine breakdown");
    expect(text).toContain("Competitor comparison");
    expect(text).toContain("Acme \\(you\\)"); // parens escaped in the PDF literal
  });
});

// ─── PDF: helpers ───────────────────────────────────────────────────────────────

describe("sanitizeAscii / escapePdfText", () => {
  it("maps typographic chars to ASCII and drops the rest", () => {
    expect(sanitizeAscii("a — b “q” ’s … 你好")).toBe('a - b "q" \'s ... ??');
  });

  it("escapes parentheses and backslashes for PDF literals", () => {
    expect(escapePdfText("a (b) \\c")).toBe("a \\(b\\) \\\\c");
  });
});
