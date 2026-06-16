#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { runTracking } from "./tracker";
import { renderConsole, renderMarkdown } from "./report";
import { MockProvider, type AnswerEngineProvider } from "./providers";
import { PerplexityProvider } from "./providers/perplexity";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { runCampaign, type Campaign } from "./campaign";
import { computeTrend } from "./trends";
import { openStore, type TrackingStore } from "./store";
import { demoConfig, demoProviders, demoCampaign } from "./demo";
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
  gh-ai-rank-tracker --provider openai --url <url>        Live analysis with OpenAI
  gh-ai-rank-tracker --demo --markdown                    Markdown report output
  gh-ai-rank-tracker --demo --json                        JSON report output

Campaigns (tracking over time):
  gh-ai-rank-tracker campaign run --demo                  Run + persist the demo campaign
  gh-ai-rank-tracker campaign run --config <campaign.json> [--provider <p>]
  gh-ai-rank-tracker campaign list                        List stored campaigns + run counts
  gh-ai-rank-tracker campaign history <campaignId> [--json]   Show the trend over time

Flags:
  --demo                  Use the bundled demo config with scripted engines
  --config, -c            Path to a JSON TrackingConfig (or Campaign for "campaign run")
  --provider, -p          Engine provider: "mock" (default) | "perplexity" | "openai" | "anthropic"
  --store, -s             Store file path (default: $TRACKER_STORE_PATH or ./.tracker/store.json)
  --markdown, --md        Render a Markdown report
  --json                  Render the raw report object as JSON
  --help, -h              Show this help

Environment variables:
  PERPLEXITY_API_KEY      Required when --provider perplexity is set
  OPENAI_API_KEY          Required when --provider openai is set
  ANTHROPIC_API_KEY       Required when --provider anthropic is set
  TRACKER_STORE_PATH      Default campaign store path`;

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

/** Flags that consume the following argv token as their value. */
const VALUE_FLAGS = new Set(["--store", "-s", "--config", "-c", "--provider", "-p", "--url", "-u"]);

/** Resolve a `--store`/`-s` path from argv, falling back to the default store. */
function resolveStore(argv: string[]): TrackingStore {
  const i = argv.findIndex((a) => a === "--store" || a === "-s");
  const path = i >= 0 ? argv[i + 1] : undefined;
  return path ? openStore(path) : openStore();
}

/** Positional (non-flag) args, skipping the value that follows a value-flag. */
function positionals(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (VALUE_FLAGS.has(a)) {
      i++; // skip this flag's value
      continue;
    }
    if (!a.startsWith("-")) out.push(a);
  }
  return out;
}

/** Instantiate live or mock providers from a `--provider` value. */
function resolveProviders(provider: string): AnswerEngineProvider[] | { error: string } {
  const live: Record<string, () => AnswerEngineProvider> = {
    perplexity: () => new PerplexityProvider(),
    openai: () => new OpenAIProvider(),
    anthropic: () => new AnthropicProvider(),
  };
  if (provider === "mock") return [new MockProvider({ engine: "mock" })];
  if (provider in live) {
    try {
      return [live[provider]!()];
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { error: `Unknown --provider "${provider}". Supported: mock, perplexity, openai, anthropic.` };
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

// ─── Campaign subcommands ──────────────────────────────────────────────────────

async function campaignRun(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const store = resolveStore(argv);

  let campaign: Campaign;
  let providers: AnswerEngineProvider[];

  if (args.demo || (!args.config && !args.url)) {
    campaign = demoCampaign;
    providers = demoProviders();
    if (!args.demo) {
      console.error("[gh-ai-rank-tracker] No --config given; running the built-in demo campaign.");
    }
  } else if (args.config) {
    campaign = JSON.parse(readFileSync(args.config, "utf8")) as Campaign;
    const resolved = resolveProviders(args.provider);
    if ("error" in resolved) {
      console.error(`[gh-ai-rank-tracker] ${resolved.error}`);
      process.exitCode = 1;
      return;
    }
    providers = resolved;
  } else {
    console.error("[gh-ai-rank-tracker] campaign run needs --demo or --config <campaign.json>.");
    process.exitCode = 1;
    return;
  }

  const run = await runCampaign(campaign, providers);
  await store.saveCampaign(campaign);
  await store.recordRun(run);
  const history = await store.getRuns(campaign.id);
  const trend = computeTrend(history);

  if (args.json) {
    console.log(JSON.stringify({ run, trend }, null, 2));
    return;
  }
  if (args.markdown) {
    console.log(renderMarkdown(run.report));
    return;
  }
  console.log(renderConsole(run.report));
  console.log("");
  console.log(
    `Campaign "${campaign.name}" — run ${run.runId} saved. ${history.length} run(s) recorded.` +
      (trend.points.length > 1
        ? ` Visibility ${trend.visibilityDelta >= 0 ? "+" : ""}${trend.visibilityDelta} since first run.`
        : ""),
  );
}

async function campaignList(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const store = resolveStore(argv);
  const campaigns = await store.listCampaigns();
  if (args.json) {
    const rows = [];
    for (const c of campaigns) rows.push({ ...c, runs: (await store.getRuns(c.id)).length });
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (campaigns.length === 0) {
    console.log("No campaigns stored yet. Run: gh-ai-rank-tracker campaign run --demo");
    return;
  }
  console.log("Stored campaigns:");
  for (const c of campaigns) {
    const runs = await store.getRuns(c.id);
    const latest = runs[runs.length - 1];
    console.log(
      `  ${c.id}  —  ${c.name}  (${runs.length} run(s)` +
        (latest ? `, latest ${latest.visibilityScore}/100 @ ${latest.generatedAt}` : "") +
        `)`,
    );
  }
}

async function campaignHistory(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const store = resolveStore(argv);
  const id = positionals(argv)[0];
  if (!id) {
    console.error("[gh-ai-rank-tracker] campaign history needs a <campaignId>.");
    process.exitCode = 1;
    return;
  }
  const runs = await store.getRuns(id);
  const trend = computeTrend(runs);
  if (args.json) {
    console.log(JSON.stringify(trend, null, 2));
    return;
  }
  if (trend.points.length === 0) {
    console.log(`No runs recorded for campaign "${id}".`);
    return;
  }
  console.log(`Trend — ${trend.brand} (campaign ${id})`);
  console.log("");
  console.log("  Date                      Visibility   SoV");
  for (const p of trend.points) {
    console.log(
      `  ${p.generatedAt}   ${String(p.visibilityScore).padStart(6)}/100   ${String(
        Math.round(p.shareOfVoice * 100),
      ).padStart(3)}%`,
    );
  }
  if (trend.points.length > 1) {
    console.log("");
    console.log(
      `  Δ visibility ${trend.visibilityDelta >= 0 ? "+" : ""}${trend.visibilityDelta}` +
        `   ·   Δ SoV ${trend.shareOfVoiceDelta >= 0 ? "+" : ""}${Math.round(
          trend.shareOfVoiceDelta * 100,
        )}%`,
    );
  }
}

async function runCampaignSubcommand(argv: string[]): Promise<void> {
  const sub = argv[0];
  const rest = argv.slice(1);
  switch (sub) {
    case "run":
      return campaignRun(rest);
    case "list":
      return campaignList(rest);
    case "history":
      return campaignHistory(rest);
    default:
      console.error(
        `[gh-ai-rank-tracker] Unknown campaign subcommand "${sub ?? ""}". ` +
          `Use: run | list | history.`,
      );
      process.exitCode = 1;
  }
}

// ─── Legacy single-run flow ─────────────────────────────────────────────────────

async function runLegacy(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

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
  if (args.provider !== "mock" || args.config || args.url) {
    const resolved = resolveProviders(args.provider);
    if ("error" in resolved) {
      console.error(`[gh-ai-rank-tracker] ${resolved.error}`);
      process.exitCode = 1;
      return;
    }
    providers = resolved;
    if (args.provider === "mock" && (args.config || args.url)) {
      console.error(
        "[gh-ai-rank-tracker] Using MockProvider. Pass --provider perplexity|openai|anthropic for live queries.",
      );
    }
  } else {
    // Demo mode — use the scripted demo providers
    providers = demoProviders();
  }

  const report = await runTracking(config, providers);

  if (args.json) console.log(JSON.stringify(report, null, 2));
  else if (args.markdown) console.log(renderMarkdown(report));
  else console.log(renderConsole(report));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === "campaign") {
    return runCampaignSubcommand(argv.slice(1));
  }
  return runLegacy(argv);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
