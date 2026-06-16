/**
 * Dependency-free PDF export.
 *
 * A minimal, correct PDF 1.4 writer: it lays out styled text lines across US-
 * Letter pages using the base-14 Helvetica fonts (no font embedding), and emits
 * a valid cross-reference table whose byte offsets point at the real objects, a
 * trailer, and %%EOF. The result opens in any PDF viewer.
 *
 * Everything is kept ASCII (text is sanitized) so each character is exactly one
 * byte — which is what makes the xref byte-offset bookkeeping exact and the
 * output deterministic. No native deps, CI-safe, fully byte-assertable in tests.
 */
import type { CampaignRun } from "../campaign";
import type { Trend } from "../trends";

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const MARGIN = 54; // 0.75 in
const USABLE_H = PAGE_H - 2 * MARGIN;
const MAX_CHARS = 100; // no line wrapping → hard truncate to fit page width

/** A styled text line for {@link buildTextPdf}. */
export interface PdfLine {
  text: string;
  /** Font size in points (default 11). */
  size?: number;
  /** Use Helvetica-Bold (default false → Helvetica). */
  bold?: boolean;
  /** Extra vertical gap (points) added below the line. */
  gap?: number;
}

/** Map common typographic chars to ASCII, then drop anything non-printable-ASCII. */
export function sanitizeAscii(s: string): string {
  return s
    .replace(/[—–]/g, "-") // em/en dash
    .replace(/[“”]/g, '"') // curly double quotes
    .replace(/[‘’]/g, "'") // curly single quotes
    .replace(/…/g, "...") // ellipsis
    .replace(/[^\x20-\x7E]/g, "?");
}

/** Escape a string for use inside a PDF literal string `( … )`. */
export function escapePdfText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function lineHeight(line: PdfLine): number {
  return Math.round((line.size ?? 11) * 1.5) + (line.gap ?? 0);
}

function truncate(s: string): string {
  return s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 1)}...` : s;
}

/** Greedily split lines into pages that each fit within the usable height. */
function paginate(lines: PdfLine[]): PdfLine[][] {
  const pages: PdfLine[][] = [];
  let current: PdfLine[] = [];
  let used = 0;
  for (const line of lines) {
    const lh = lineHeight(line);
    if (used + lh > USABLE_H && current.length > 0) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(line);
    used += lh;
  }
  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}

/** Build the content-stream operators for one page's lines. */
function pageStream(lines: PdfLine[]): string {
  const ops: string[] = ["BT", `1 0 0 1 ${MARGIN} ${PAGE_H - MARGIN} Tm`];
  for (const line of lines) {
    const font = line.bold ? "/F2" : "/F1";
    const size = line.size ?? 11;
    ops.push(`0 -${lineHeight(line)} Td`);
    ops.push(`${font} ${size} Tf`);
    ops.push(`(${escapePdfText(sanitizeAscii(truncate(line.text)))}) Tj`);
  }
  ops.push("ET");
  return ops.join("\n");
}

/**
 * Build a complete, valid PDF document from styled text lines.
 * Returns the raw bytes (Uint8Array).
 */
export function buildTextPdf(lines: PdfLine[]): Uint8Array {
  const pages = paginate(lines);

  // Object layout: 1=Catalog 2=Pages 3=Helvetica 4=Helvetica-Bold,
  // then per page: pageObj (5,7,9…) + contentObj (6,8,10…).
  const pageObjNum = (j: number) => 5 + 2 * j;
  const contentObjNum = (j: number) => 6 + 2 * j;

  const objects: string[] = [];
  const kids = pages.map((_, j) => `${pageObjNum(j)} 0 R`).join(" ");

  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`); // obj 1
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`); // obj 2
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`); // obj 3
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`); // obj 4

  pages.forEach((pageLines, j) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjNum(j)} 0 R >>`,
    ); // page obj
    const stream = pageStream(pageLines);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`); // content obj
  });

  // Assemble bytes, tracking each object's byte offset. All ASCII → 1 byte/char.
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets[i] = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += `0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;

  // Latin1 view: every char is < 128 so the byte length equals the string
  // length used for offsets above — guaranteeing the xref offsets are exact.
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

function pct01(n: number): string {
  return `${Math.round(n * 100)}%`;
}
function signed(n: number): string {
  return `${n >= 0 ? "+" : ""}${n}`;
}

/** Render a campaign run + trend as a one-or-more-page PDF report. */
export function renderCampaignPdf(run: CampaignRun, trend: Trend, campaignName?: string): Uint8Array {
  const name = campaignName ?? run.campaignId;
  const lines: PdfLine[] = [];

  lines.push({ text: `AI Visibility Report - ${run.brand}`, size: 20, bold: true, gap: 6 });
  lines.push({ text: `Campaign: ${name}`, size: 10 });
  lines.push({ text: `Generated: ${run.generatedAt}`, size: 10, gap: 8 });
  lines.push({ text: `AI Visibility Score: ${run.visibilityScore}/100`, size: 14, bold: true });
  if (trend.points.length > 1) {
    lines.push({
      text: `Since first run: ${signed(trend.visibilityDelta)} visibility, ${signed(
        Math.round(trend.shareOfVoiceDelta * 100),
      )}% share of voice`,
      size: 10,
      gap: 10,
    });
  } else {
    lines.push({ text: "", size: 4, gap: 6 });
  }

  lines.push({ text: "Share of voice over time", size: 13, bold: true, gap: 4 });
  for (const p of trend.points) {
    lines.push({ text: `  ${p.generatedAt}   visibility ${p.visibilityScore}/100   SoV ${pct01(p.shareOfVoice)}`, size: 10 });
  }

  lines.push({ text: "Per-engine breakdown", size: 13, bold: true, gap: 10 });
  for (const e of run.engineBreakdown) {
    lines.push({ text: `  ${e.engine}: score ${e.score}/100, mention ${pct01(e.mentionRate)}, citation ${pct01(e.citationRate)}`, size: 10 });
  }

  if (run.competitorComparison.length) {
    lines.push({ text: "Competitor comparison", size: 13, bold: true, gap: 10 });
    for (const c of run.competitorComparison) {
      const label = c.isTracked ? `${c.brand} (you)` : c.brand;
      const gap = c.isTracked ? "" : `, gap vs you ${signed(Math.round(c.gapVsTracked * 100))}%`;
      lines.push({ text: `  ${label}: SoV ${pct01(c.shareOfVoice)}${gap}`, size: 10 });
    }
  }

  lines.push({ text: "Per-prompt drill-down", size: 13, bold: true, gap: 10 });
  for (const p of run.report.prompts) {
    const flags = `${p.mentionedAnywhere ? "M" : "-"}${p.citedAnywhere ? "C" : "-"}`;
    lines.push({ text: `  [${p.score}/100 ${flags}] ${p.prompt}`, size: 10 });
  }

  lines.push({ text: "Generated by gh-ai-rank-tracker", size: 9, gap: 14 });

  return buildTextPdf(lines);
}
