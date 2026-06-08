# gh-ai-rank-tracker

> **Track whether AI answer engines mention and cite your brand.** A GEO / AEO visibility & share-of-voice tracker for the age of ChatGPT, Perplexity, Google AI Overviews and Gemini.

![status](https://img.shields.io/badge/status-v0.1%20MVP-blue) ![license](https://img.shields.io/badge/license-MIT-green) ![node](https://img.shields.io/badge/node-%3E%3D20-339933) ![tests](https://img.shields.io/badge/tests-vitest-6E9F18)

<!-- hero screenshot / GIF placeholder — add a terminal recording of `npm run demo` here -->

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
- **Pluggable engines** — a clean `AnswerEngineProvider` interface; ships a deterministic `MockProvider` so the whole engine runs offline and is fully unit-tested.
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

## How the score works

Each (brand, response) pair earns up to 100 points from four signals (weights are tunable via `ScoreWeights`):

| Signal | Default weight | Meaning |
|---|---:|---|
| Mention presence | 35 | The brand is named in the answer |
| Mention prominence | 20 | Scaled by how early the first mention appears |
| Citation presence | 30 | The brand's domain appears in the sources |
| Citation prominence | 15 | Scaled by how near the top the citation sits |

Per-prompt scores are the mean across engines; the overall **AI Visibility Score** is the prompt-weighted average.

## Connecting real answer engines

v0.1 ships the deterministic `MockProvider` so the scoring engine is fully testable offline. Live adapters implement the same interface:

```ts
export interface AnswerEngineProvider {
  readonly engine: string;
  query(prompt: string): Promise<EngineResponse>;
}
```

Bring your own keys and plug in Perplexity, OpenAI, Gemini or a Google AI Overviews scraper — the scoring, share-of-voice and reporting all work unchanged.

## Roadmap

- [ ] Live provider adapters (Perplexity, OpenAI, Gemini, Google AI Overviews)
- [ ] Scheduled runs + historical trend tracking
- [ ] Web UI + shareable report (Next.js)
- [ ] Optional lead capture for the hosted free tool

## Built by GrowthHackers

Built and maintained by [GrowthHackers](https://growthackers.io), a data-driven growth marketing agency. We build open tools for GEO, AEO and AI search visibility. Issues and PRs welcome.

## License

MIT © GrowthHackers (GH)
