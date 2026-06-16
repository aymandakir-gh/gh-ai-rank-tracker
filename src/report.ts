import type { TrackingReport } from "./types";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Escape a string for a Markdown table cell (backslash, then pipe, then collapse line breaks). */
function escapePipe(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

/** Collapse line breaks for an inline (heading / list / bold) interpolation. */
function inline(s: string): string {
  return s.replace(/[\r\n]+/g, " ");
}

/** Render a tracking report as Markdown (suitable for a repo, doc or email). */
export function renderMarkdown(r: TrackingReport): string {
  const lines: string[] = [];
  lines.push(`# AI Visibility Report — ${inline(r.brand)}`);
  lines.push("");
  lines.push(`**AI Visibility Score:** ${r.visibilityScore}/100`);
  lines.push(`**Generated:** ${r.generatedAt}`);
  lines.push(`**Engines:** ${r.engines.join(", ")}`);
  lines.push("");
  lines.push(
    `**Coverage:** mentioned in ${pct(r.coverage.mentionRate)} of prompts · cited in ${pct(
      r.coverage.citationRate,
    )} · ${r.coverage.totalResponses} responses across ${r.coverage.totalPrompts} prompts.`,
  );
  lines.push("");

  lines.push("## Prompt breakdown");
  lines.push("");
  lines.push("| Prompt | Score | Mentioned | Cited |");
  lines.push("|---|---:|:---:|:---:|");
  for (const p of r.prompts) {
    lines.push(
      `| ${escapePipe(p.prompt)} | ${p.score} | ${p.mentionedAnywhere ? "yes" : "—"} | ${
        p.citedAnywhere ? "yes" : "—"
      } |`,
    );
  }
  lines.push("");

  if (r.shareOfVoice.length) {
    lines.push("## Share of voice");
    lines.push("");
    lines.push("| Brand | Presence | Mentions | Share |");
    lines.push("|---|---:|---:|---:|");
    for (const s of r.shareOfVoice) {
      lines.push(`| ${escapePipe(s.brand)} | ${s.presence} | ${s.mentions} | ${pct(s.share)} |`);
    }
    lines.push("");
  }

  if (r.gaps.length) {
    lines.push("## Visibility gaps (no mention in any engine)");
    lines.push("");
    for (const g of r.gaps) lines.push(`- ${inline(g)}`);
    lines.push("");
  }

  lines.push("## Recommendations");
  lines.push("");
  for (const rec of r.recommendations) {
    lines.push(`- **[${rec.severity.toUpperCase()}]** ${inline(rec.message)}`);
  }
  lines.push("");

  return lines.join("\n");
}

/** Render a compact, console-friendly version of a tracking report. */
export function renderConsole(r: TrackingReport): string {
  const lines: string[] = [];
  lines.push(`AI Visibility Report — ${r.brand}`);
  lines.push(`Score: ${r.visibilityScore}/100  |  engines: ${r.engines.join(", ")}`);
  lines.push(
    `Coverage: mention ${pct(r.coverage.mentionRate)} · citation ${pct(r.coverage.citationRate)}`,
  );
  lines.push("");
  lines.push("Prompts:");
  for (const p of r.prompts) {
    const flags = `${p.mentionedAnywhere ? "M" : "-"}${p.citedAnywhere ? "C" : "-"}`;
    lines.push(`  [${String(p.score).padStart(5)}] ${flags}  ${p.prompt}`);
  }
  if (r.shareOfVoice.length) {
    lines.push("");
    lines.push("Share of voice:");
    for (const s of r.shareOfVoice) {
      lines.push(`  ${pct(s.share).padStart(4)}  ${s.brand} (presence ${s.presence})`);
    }
  }
  lines.push("");
  lines.push("Recommendations:");
  for (const rec of r.recommendations) lines.push(`  [${rec.severity}] ${rec.message}`);
  return lines.join("\n");
}
