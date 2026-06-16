# gh-ai-rank-tracker

> **Track whether AI answer engines mention and cite your brand.** A GEO / AEO visibility & share-of-voice tracker for the age of ChatGPT, Perplexity, Google AI Overviews and Gemini.

![status](https://img.shields.io/badge/status-v0.4%20live%20adapters-blue) [![CI](https://github.com/aymandakir-gh/gh-ai-rank-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/aymandakir-gh/gh-ai-rank-tracker/actions/workflows/ci.yml) ![license](https://img.shields.io/badge/license-MIT-green) ![node](https://img.shields.io/badge/node-%3E%3D20-339933) ![tests](https://img.shields.io/badge/tests-vitest-6E9F18)

<!-- DEMO PLACEHOLDER — replace with a terminal recording of `npm run demo`.
     See "Recording the demo" below for the vhs / asciinema steps.
     ![demo](docs/demo.gif) -->
![demo placeholder](https://img.shields.io/badge/demo-record%20with%20vhs%20%E2%86%92%20docs%2Fdemo.gif-lightgrey)

Search is moving from ten blue links to a single AI-generated answer. If the answer engine doesn't mention or cite you, you're invisible — and classic rank trackers can't see it. **gh-ai-rank-tracker** measures your presence *inside the answers*: are you named, how prominently, are you cited, and how do you stack up against competitors.

## Why this exists

Generative Engine Optimization (GEO) and Answer Engine Optimization (AEO) are the new front line of organic visibility. Teams need a repeatable way to answer:

- For the prompts our buyers actually ask, does the AI mention us at all?
- When it does, are we named early or buried at the end?
- Does it *cite* our domain as a source — and at what rank?
- What's our share of voice versus the competitors the AI keeps recommending?

This tool turns those questions into a single, repeatable **AI Visibility Score (0–100)** plus an actionable breakdown.

## What it does

- **Mention detection** — boundary-aware, alias-aware, case-insensitive (no "Notion" inside "promotional" false positives).
- **Citation detection** — normalizes URLs and matches your domain (and subdomains), with citation rank.
- **Visibility scoring** — a transparent, tunable 0–100 score combining mention presence, mention prominence, citation presence and citation rank.
- **Share of voice** — benchmark presence and mention volume against any set of competitors.
- **Coverage + gaps** — see exactly which prompts return zero mentions of you.
- **Recommendations** — prioritized, rule-based next steps (high / medium / low).
- **Campaigns & tracking over time** — define a prompt *set* per brand, run it repeatedly, and persist every run to a **local-first JSON store** (no external DB) so you can watch your visibility + share-of-voice **trend across runs**.
- **Competitor share-of-voice** — track competitors alongside your brand and get a head-to-head SoV gap, aggregated across prompts × engines.
- **Exportable reports** — a Markdown report or a dependency-free **PDF**.
- **Live answer engines** — first-class adapters for **OpenAI**, **Perplexity**, **Anthropic** (Claude) and **Google Gemini**, all behind your own API keys and all implementing one `AnswerEngineProvider` interface. The deterministic `MockProvider` is the no-key default, so the whole engine still runs offline and is fully unit-tested.
- **Reports** — console, Markdown, or raw JSON.

## Install

```bash
git clone https://github.com/aymandakir-gh/gh-ai-rank-tracker.git
cd gh-ai-rank-tracker
npm install
```

## Quick start

Run the built-in demo (no API keys, no setup):

```bash
npm run demo            # console report
npm run demo -- --markdown   # Markdown report
npm run demo -- --json       # raw JSON
```

Run the tests:

```bash
npm test
```

## Use your own config

Create a JSON `TrackingConfig` (see [`examples/demo-config.json`](examples/demo-config.json)):

```json
{
  "brand": { "name": "GrowthHackers", "aliases": ["GH"], "domain": "growthackers.io" },
  "competitors": [{ "name": "HubSpot", "domain": "hubspot.com" }],
  "prompts": [
    { "prompt": "best growth marketing agencies for B2B SaaS", "weight": 2 }
  ]
}
```

```bash
npm run cli -- --config ./examples/demo-config.json --markdown
```

Or use it as a library:

```ts
import { runTracking, MockProvider } from "gh-ai-rank-tracker";

const report = await runTracking(config, [new MockProvider({ /* scripted answers */ })]);
console.log(report.visibilityScore, report.shareOfVoice, report.gaps);
```

## Campaigns & tracking over time

A **campaign** is a named brand + competitors + a *set* of prompts. Each run is
scored, benchmarked for share-of-voice, and appended to a **local-first JSON
store** (default `./.tracker/store.json`, or set `TRACKER_STORE_PATH`) — no
external database. Run it again over time and the trend builds up.

```bash
# Run + persist the built-in demo campaign (no API keys):
npm run cli -- campaign run --demo

# Run your own campaign (JSON Campaign file) against a live engine:
OPENAI_API_KEY=sk-... npm run cli -- campaign run --config ./my-campaign.json --provider openai

npm run cli -- campaign list                       # stored campaigns + run counts
npm run cli -- campaign history demo-growthhackers # visibility + SoV trend over time
```

A `Campaign` JSON file looks like:

```json
{
  "id": "acme-geo",
  "name": "Acme — GEO visibility",
  "brand": { "name": "Acme", "domain": "acme.com" },
  "competitors": [{ "name": "Rival", "domain": "rival.com" }],
  "prompts": [
    { "prompt": "best widget vendors for enterprise", "weight": 2 },
    { "prompt": "how to choose a widget platform", "weight": 1 }
  ]
}
```

From code, the same flow is `runCampaign(campaign, providers)` → append to a
`JsonFileStore`/`InMemoryStore` → `computeTrend(runs)`.

## Export a report

```bash
npm run cli -- campaign export acme-geo --format md  --out report.md
npm run cli -- campaign export acme-geo --format pdf --out report.pdf
```

The PDF writer is pure TypeScript (no native deps): a valid PDF 1.4 with the
base-14 Helvetica font and a correct cross-reference table — it opens in any
viewer. The web dashboard also offers a one-click Markdown download.

## Web dashboard

The Next.js app (`web/`) includes a **campaign dashboard** (`/campaign`): a
share-of-voice **trend chart over time**, a **per-engine breakdown**, a
**competitor comparison**, and an expandable **per-prompt drill-down** — fully
internationalized across 9 languages (`?lang=`), Tailwind-only charts with
`<table>` accessibility fallbacks, and self-contained (works without API keys).

```bash
cd web && npm install && npm run dev   # http://localhost:3003/campaign
```

## How the score works

> Full math + assumptions + limitations: **[METHODOLOGY.md](METHODOLOGY.md)**.

Each (brand, response) pair earns up to 100 points from four signals (weights are tunable via `ScoreWeights`):

| Signal | Default weight | Meaning |
|---|---:|---|
| Mention presence | 35 | The brand is named in the answer |
| Mention prominence | 20 | Scaled by how early the first mention appears |
| Citation presence | 30 | The brand's domain appears in the sources |
| Citation prominence | 15 | Scaled by how near the top the citation sits |

Per-prompt scores are the mean across engines; the overall **AI Visibility Score** is the prompt-weighted average.

## Live answer engines

The scoring engine is provider-agnostic — every engine implements one interface:

```ts
export interface AnswerEngineProvider {
  readonly engine: string;
  query(prompt: string): Promise<EngineResponse>;
}
```

Four **live** adapters ship alongside the offline `MockProvider`. Each reads its
key from the environment only (never committed) and uses the provider's
web-search / grounding capability so answers come back with real source
citations:

| Provider | `--provider` value | Env var | Model override | Default model |
|---|---|---|---|---|
| Mock (offline default) | `mock` | — | — | — |
| OpenAI | `openai` | `OPENAI_API_KEY` | `OPENAI_MODEL` | `gpt-4o` |
| Perplexity | `perplexity` | `PERPLEXITY_API_KEY` | `PERPLEXITY_MODEL` | `sonar` |
| Anthropic (Claude) | `anthropic` | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` | `claude-sonnet-4-6` |
| Google Gemini | `gemini` | `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) | `GEMINI_MODEL` | `gemini-2.0-flash` |

> **Gemini grounding note:** Gemini returns sources as grounding-redirect links
> with the source domain in the `title`. The adapter maps a domain-shaped title
> to `https://<domain>` so brand-domain citation detection works, falling back
> to the raw redirect URL otherwise.

### Setup

Copy the example env file and fill in only the keys you have — any provider
whose key is missing simply isn't available (the others still work):

```bash
cp .env.example .env       # then edit .env
# or export inline:
export OPENAI_API_KEY=sk-...
export PERPLEXITY_API_KEY=pplx-...
export ANTHROPIC_API_KEY=sk-ant-...
```

### Run against a live engine (one-liner)

```bash
# Quick analysis of a brand URL with a live engine:
OPENAI_API_KEY=sk-... npm run cli -- --provider openai --url https://yourbrand.com --markdown
PERPLEXITY_API_KEY=pplx-... npm run cli -- --provider perplexity --url https://yourbrand.com
ANTHROPIC_API_KEY=sk-ant-... npm run cli -- --provider anthropic --config ./examples/demo-config.json
```

Or from code:

```ts
import { runTracking, OpenAIProvider, AnthropicProvider } from "gh-ai-rank-tracker";

const report = await runTracking(config, [
  new OpenAIProvider(),     // reads OPENAI_API_KEY
  new AnthropicProvider(),  // reads ANTHROPIC_API_KEY
]);
```

> **Cost note:** live providers make real, billable API calls. The CLI and
> library never call out unless you select a live `--provider`; the default is
> always the offline `MockProvider`.

## Demo

A committed, plain-text transcript of the real CLI (`--demo`, `campaign
run/list/history/export`) lives at **[`docs/demo.txt`](docs/demo.txt)** — a
zero-dependency fallback for the animated GIF.

To render the GIF, a ready-to-run [vhs](https://github.com/charmbracelet/vhs)
script is committed at **[`docs/demo.tape`](docs/demo.tape)**:

```bash
vhs docs/demo.tape          # → docs/demo.gif
```

Then swap `docs/demo.gif` into the `<!-- DEMO PLACEHOLDER -->` block at the top
of this README.

## API

The Hono HTTP API (v0.3) exposes:

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check — returns `{ ok, version, ts }` |
| `POST` | `/api/scan` | Bearer | Run a full AI visibility scan for a URL |
| `POST` | `/api/campaign` | Bearer | Run + persist a campaign; returns the run, full history and trend |
| `GET` | `/api/campaign/:id` | Bearer | Read a campaign's persisted history + trend |

### POST /api/scan

```bash
curl -X POST https://<your-domain>/api/scan \
  -H "Authorization: Bearer $SCAN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://yoursite.com","providers":["mock"]}'
```

Request body:

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string | ✅ | Brand URL — name + domain inferred automatically |
| `providers` | string[] | ❌ | any of `"mock"`, `"perplexity"`, `"openai"`, `"anthropic"`, `"gemini"` (default: `["mock"]`). Live providers require the matching API key in the server env. |

## Deploy

### Railway (recommended)

1. **Create a new Railway service** linked to this repo.
2. **Set environment variables** in the Railway dashboard:

   | Variable | Required | Description |
   |---|---|---|
   | `SCAN_API_KEY` | ✅ | Bearer token for API auth — generate with `openssl rand -hex 32` |
   | `PERPLEXITY_API_KEY` | Only for `provider=perplexity` | Perplexity API key |
   | `OPENAI_API_KEY` | Only for `provider=openai` | OpenAI API key |
   | `ANTHROPIC_API_KEY` | Only for `provider=anthropic` | Anthropic API key |
   | `PORT` | ❌ | Injected automatically by Railway |

3. **Deploy** — Railway picks up `railway.toml` automatically:
   - Build: `npm run build` (TypeScript → `dist/`)
   - Start: `npm start` (`node dist/src/server.js`)
   - Healthcheck: `GET /health` (timeout 30 s)

> **Note:** The server will refuse to start (`process.exit(1)`) if `SCAN_API_KEY` is not set outside of `NODE_ENV=development`. This is intentional — prevents accidental open deployments.

### Local development

```bash
# Run API server without auth (dev mode)
NODE_ENV=development npm run api:dev

# Run with auth (mirrors production)
SCAN_API_KEY=dev-secret npm run api:dev
```

For the Next.js web UI (port 3001, proxies to the API):

```bash
cd web
npm install
SCAN_API_URL=http://localhost:3000 npm run dev
```

## Roadmap

- [x] Core scoring engine (mention + citation + share of voice + gaps)
- [x] REST API (Hono, Bearer auth, rate limiting)
- [x] Web UI (Next.js, i18n 9 languages, a11y)
- [x] Live provider adapters — OpenAI, Perplexity, Anthropic (Claude), Google Gemini
- [x] Email gate + lead capture (web)
- [x] Observability — Sentry + PostHog on the web app (graceful-degrade)
- [x] Campaigns + local-first persisted store + historical trend tracking
- [x] Competitor share-of-voice benchmarking (CLI + API + web)
- [x] Web campaign dashboard — trend chart, per-engine, competitor, drill-down (i18n)
- [x] Exportable campaign report — Markdown + dependency-free PDF
- [ ] Google AI Overviews adapter

## Built by GrowthHackers

Built and maintained by [GrowthHackers](https://growthackers.io), a data-driven growth marketing agency. We build open tools for GEO, AEO and AI search visibility. Issues and PRs welcome.

## License

MIT © GrowthHackers (GH)
