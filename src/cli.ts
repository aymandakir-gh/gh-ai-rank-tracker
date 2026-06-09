#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { runTracking } from "./tracker";
import { renderConsole, renderMarkdown } from "./report";
import { MockProvider, type AnswerEngineProvider } from "./providers";
import { PerplexityProvider } from "./providers/perplexity";
import { demoConfig, demoProviders } from "./demo";
import type { TrackingConfig } from "./types";

interface CliArgs {
  demo: boolean;
  config?: string;
  provider: string;
  url?: string;
  json: boolean;
  markdown: boolean;
  help: boolean;
}

const HELP = `gh-ai-rank-tracker — GEO/AEO AI visibility tracker

Usage:
  gh-ai-rank-tracker --demo                               Run the built-in demo (no setup)
  gh-ai-rank-tracker --config <file.json>                 Run with your own TrackingConfig
  gh-ai-rank-tracker --provider perplexity --url <url>    Live analysis with Perplexity
  gh-ai-rank-tracker --demo --markdown                    Markdown report output
  gh-ai-rank-tracker --demo --json                        JSON report output

Flags:
  --demo                  Use the bundled demo config with scripted engines
  --config, -c            Path to a JSON TrackingConfig file
  --provider, -p          Engine provider: "mock" (default) | "perplexity"
  --url, -u               Brand URL for quick analysis (uses demo prompts)
  --markdown, --md        Render a Markdown report
  --json                  Render the raw report object as JSON
  --help, -h              Show this help

Environment variables:
  PERPLEXITY_API_KEY      Required when --provider perplexity is set`;

function parseArgs(argv: string[]): CliArgs {
  const a: CliArgs = {
    demo: false,
    json: false,
    markdown: false,
    help: false,
    provider: "mock",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--demo") a.demo = true;
    else if (arg === "--json") a.json = true;
    else if (arg === "--markdown" || arg === "--md") a.markdown = true;
    else if (arg === "--help" || arg === "-h") a.help = true;
    else if (arg === "--config" || arg === "-c") a.config = argv[++i];
    else if (arg === "--provider" || arg === "-p") a.provider = argv[++i] ?? "mock";
    else if (arg === "--url" || arg === "-u") a.url = argv[++i];
  }
  return a;
}

/** Derive a quick TrackingConfig from a brand URL using the demo prompt set. */
function buildConfigFromUrl(rawUrl: string): TrackingConfig {
  const parsed = new URL(rawUrl); // throws TypeError on invalid URL
  const hostname = parsed.hostname.replace(/^www\./, "");
  const [firstPart] = hostname.split(".");
  const brandName =
    firstPart ? firstPart.charAt(0).toUpperCase() + firstPart.slice(1) : hostname;
  return {
    brand: { name: brandName, domain: hostname, aliases: [hostname] },
    prompts: demoConfig.prompts,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP);
    return;
  }

  // ── Config ─────────────────────────────────────────────────────────────────
  let config: TrackingConfig;
  if (args.config) {
    config = JSON.parse(readFileSync(args.config, "utf8")) as TrackingConfig;
  } else if (args.url) {
    try {
      config = buildConfigFromUrl(args.url);
    } catch {
      console.error(`[gh-ai-rank-tracker] Invalid --url: "${args.url}"`);
      process.exitCode = 1;
      return;
    }
  } else {
    config = demoConfig;
    if (!args.demo) {
      console.error(
        "[gh-ai-rank-tracker] No --config or --url given; running the built-in --demo.",
      );
    }
  }

  // ── Providers ───────────────────────────────────────────────────────────────
  let providers: AnswerEngineProvider[];
  if (args.provider === "perplexity") {
    try {
      providers = [new PerplexityProvider()];
    } catch (err) {
      console.error(
        `[gh-ai-rank-tracker] ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exitCode = 1;
      return;
    }
  } else if (args.config || args.url) {
    // Custom config / URL mode with the default mock provider
    providers = [new MockProvider({ engine: "mock" })];
    console.error(
      "[gh-ai-rank-tracker] Using MockProvider. Pass --provider perplexity for live queries.",
    );
  } else {
    // Demo mode — use the scripted demo providers
    providers = demoProviders();
  }

  const report = await runTracking(config, providers);

  if (args.json) console.log(JSON.stringify(report, null, 2));
  else if (args.markdown) console.log(renderMarkdown(report));
  else console.log(renderConsole(report));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
