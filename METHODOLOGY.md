# Methodology

How `gh-ai-rank-tracker` turns AI answer-engine responses into numbers: the **AI
Visibility Score**, **share of voice**, the **per-engine breakdown**, and the
**trend over time** — plus the assumptions and limitations behind each. Every
formula here matches the code in [`src/`](src) and is covered by tests.

## 1. Inputs

For each tracked **prompt**, every configured **engine** (a provider:
`mock`, `openai`, `perplexity`, `anthropic`, `gemini`) returns one
`EngineResponse`:

- `text` — the natural-language answer.
- `citations` — the source URLs the engine cited, in the order presented.

A run queries **every prompt on every engine once**, producing
`prompts × engines` responses. Live engines use their web-search / grounding
tools so citations reflect real sources; the offline `MockProvider` returns
scripted answers (deterministic, used for the demo, tests, and keyless runs).

## 2. Detecting a brand in one response

**Mention** (`src/detect.ts → detectMention`). A brand is "mentioned" when any of
its terms (name + aliases) appears in the answer text. Matching is:

- **case-insensitive** and **boundary-aware** via Unicode look-arounds, so
  `Notion` does **not** match inside `promotional` — but `Cal.com` still matches
  (punctuation inside a term is allowed).
- **prominence** ∈ [0,1]: `1 − firstIndex / textLength`, i.e. the earlier the
  first mention, the higher. A real but very late mention is floored at **0.05**
  so it never scores exactly zero.

**Citation** (`detectCitation`). A citation counts for the brand when a cited
URL's host equals the brand's domain or a subdomain of it (URLs are normalized:
scheme, `www.`, path, query, fragment and port stripped). Citation prominence is
**rank-based**: `1 − (rank − 1) / total`, so the first source scores ~1.0 and
later ones less.

## 3. The visibility score (0–100)

Each (brand, response) pair earns points from four signals
(`src/score.ts → DEFAULT_WEIGHTS`, all tunable via `ScoreWeights`):

| Signal | Default weight | Earned when… |
|---|---:|---|
| Mention presence | 35 | the brand is named at all |
| Mention prominence | 20 | scaled by how early the first mention is |
| Citation presence | 30 | the brand's domain is among the sources |
| Citation prominence | 15 | scaled by how near the top the citation sits |

For one response:

```
raw = (mentioned ? 35 + 20·mentionProminence : 0)
    + (cited     ? 30 + 15·citationProminence : 0)
score = round1(raw / 100 · 100)        // 100 = sum of the four weights
```

- **Per prompt:** the mean of its per-engine response scores.
- **Overall AI Visibility Score:** the **prompt-weighted average** of the
  per-prompt scores (a prompt's `weight`, default 1, lets bottom-funnel queries
  count more). All scores are 0–100, rounded to one decimal.

**Coverage** reports the fraction of prompts mentioned (and cited) in **at least
one** engine. **Gaps** are prompts with zero mentions across all engines.

## 4. Share of voice (across prompts × engines)

`shareOfVoice` (`src/score.ts`) is computed over the **whole response set** for
the tracked brand and every competitor:

- **presence** — number of responses in which the brand is mentioned.
- **mentions** — total mention occurrences (tiebreaker).
- **share** — `presence / Σ presence` across the tracked brand set (0–1).

So share of voice is a *set-level* measure: it answers "across all the prompts
our buyers ask, on all the engines, how often does each brand show up at all" —
not a single query. The **competitor comparison** (`src/campaign.ts`) adds a
head-to-head `gapVsTracked = trackedShare − competitorShare`: positive means the
tracked brand leads that competitor; negative means it trails.

> Share of voice is deliberately **presence-based, not prominence-weighted** — it
> measures *who shows up*. Prominence (how early / how high-ranked) is captured
> separately in the visibility score. Keep the two distinct when reading a report.

## 5. Per-engine breakdown

`engineBreakdown` groups a run's responses by engine and reports, per engine: the
mean tracked-brand score, the mention rate and citation rate (fraction of that
engine's prompts), and the response count. It surfaces engine-specific
strengths/blind-spots (e.g. cited on Perplexity but invisible on Gemini).

## 6. Trend over time

A **campaign** (`src/campaign.ts`) is a named brand + competitors + prompt set.
Each `runCampaign` produces a `CampaignRun` appended to a local-first store
(`src/store.ts`, a JSON file — no external DB). `computeTrend` (`src/trends.ts`)
orders a campaign's runs oldest-first into `TrendPoint`s (visibility, tracked
share of voice, per-brand share, per-engine score) and reports first→last
**deltas**. With a single run the deltas are 0 and the trend is a single point.

## 7. Limitations (read before trusting a number)

- **AI answers are non-deterministic.** Live engines can answer the same prompt
  differently across runs (model updates, search recency, temperature). One run
  is a **sample**, not ground truth — trends over several runs are more reliable
  than any single score. The demo/mock path is deterministic by design.
- **One query per prompt per engine per run.** No repeated sampling/averaging
  within a run; noisy prompts move the score run-to-run.
- **Citation-domain detection is host-based.** It matches the brand's own
  domain(s). It will not credit a brand mentioned only inside a third-party page
  (e.g. a directory) unless that page's host is configured as an alias.
  **Gemini** returns grounding-redirect links with the source domain in the
  `title`; the adapter maps a domain-shaped title to `https://<domain>` so
  detection works, but a page-title (non-domain) source falls back to the raw
  redirect URL and won't match a brand domain.
- **Mention matching is Latin-script tuned.** Boundary detection uses Unicode
  letter/number classes, but very short or ambiguous brand names can over- or
  under-match; configure precise `aliases`.
- **Share of voice only counts the brands you track.** It is a share of the
  *configured* set, not of every brand the engine might mention.
- **Weights are a model, not a law.** The 35/20/30/15 split is a sensible default
  for "named early + cited high = most valuable"; tune `ScoreWeights` for your
  own definition of visibility.
- **PDF export is Latin-1.** The pure-TS PDF writer uses base-14 Helvetica and
  sanitizes non-Latin characters to `?`. Use the Markdown export for full
  Unicode (e.g. CJK brand names).
- **Not a traffic/analytics tool.** This measures presence *inside AI answers*,
  not clicks, conversions, or downstream traffic.

## 8. Reproducing the numbers

```bash
npm run demo -- --json                              # raw report object
npm run cli -- campaign run --demo --json           # a campaign run + trend
npm run cli -- campaign export demo-growthhackers --format md --out report.md
```

Everything above is exercised by the test suite (`tests/score.test.ts`,
`detect.test.ts`, `campaign.test.ts`, `trends.test.ts`, `export.test.ts`, …).
