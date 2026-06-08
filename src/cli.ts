#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { runTracking } from "./tracker";
import { renderConsole, renderMarkdown } from "./report";
import { MockProvider, type AnswerEngineProvider } from "./providers";
import { demoConfig, demoProviders } from "./demo";
import type { TrackingConfig } from "./types";

interface CliArgs {
  demo: boolean;
  config?: string;
  json: boolean;
  markdown: boolean;
  help: boolean;
}

const HELP = `gh-ai-rank-tracker — GEO/AEO AI visibility tracker

Usage:
  gh-ai-rank-tracker --demo                 Run the built-in demo (no setup)
  gh-ai-rank-tracker --config <file.json>   Run with your own TrackingConfig
  gh-ai-rank-tracker --demo --markdown      Output a Markdown report
  gh-ai-rank-tracker --demo --json          Output the raw report as JSON

Flags:
  --demo            Use the bundled demo config + scripted engines
  --config, -c      Path to a JSON TrackingConfig
  --markdown, --md  Render a Markdown report
  --json            Render the raw report object as JSON
  --help, -h        Show this help

Note: v0.1 ships the deterministic MockProvider. Live engine adapters
(Perplexity, OpenAI, Gemini, Google AI Overviews) implement the same
AnswerEngineProvider interface and are the next milestone.`;

function parseArgs(argv: string[]): CliArgs {
  const a: CliArgs = { demo: false, json: false, markdown: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--demo") a.demo = true;
    else if (arg === "--json") a.json = true;
    else if (arg === "--markdown" || arg === "--md") a.markdown = true;
    else if (arg === "--help" || arg === "-h") a.help = true;
    else if (arg === "--config" || arg === "-c") a.config = argv[++i];
  }
  return a;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  let config: TrackingConfig;
  let providers: AnswerEngineProvider[];

  if (args.config) {
    config = JSON.parse(readFileSync(args.config, "utf8")) as TrackingConfig;
    providers = [new MockProvider({ engine: "mock" })];
    console.error(
      "[gh-ai-rank-tracker] Loaded config; using MockProvider (no live adapters in v0.1). Wire a real provider to query live engines.",
    );
  } else {
    config = demoConfig;
    providers = demoProviders();
    if (!args.demo) {
      console.error("[gh-ai-rank-tracker] No --config given; running the built-in --demo.");
    }
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
