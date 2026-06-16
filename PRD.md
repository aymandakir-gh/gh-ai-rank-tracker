# PRD — gh-ai-rank-tracker v0.5.0 → v1.0.0

Spec-first roadmap from the shipped **v0.4.0** (live OpenAI/Perplexity/Anthropic
adapters + MockProvider, Hono API, Next.js web in 9 languages, 326 passing
tests) to a launch-grade **v1.0.0**. Decisions are encoded here, in commits, and
in [STATUS.md](STATUS.md). Predecessors: [PLAN.md](PLAN.md) (v0.4.0 gap analysis),
[SPEC.md](SPEC.md) (M3 web spec).

## Product thesis

v0.4.0 answers "for a single prompt, does an answer engine mention/cite my
brand?" v1.0.0 answers the question a GEO/AEO team actually has: **"across the
set of prompts our buyers ask, how is our brand's share-of-voice trending over
time versus competitors, per engine — and what changed?"** That requires a
prompt *set* (campaign), a *persisted history*, *competitor* benchmarking, more
*engines*, a *dashboard* with trends, and an *exportable report*.

## Architecture decisions (locked)

- **Local-first persistence:** a single JSON file (`JsonFileStore`) behind a
  `TrackingStore` interface; `InMemoryStore` for tests/ephemeral use. No external
  DB, no network. Default path `./.tracker/store.json` (override:
  `TRACKER_STORE_PATH`). Stores `{ campaigns, runs }`.
- **Campaign = brand + competitors + prompt set + engines.** `runCampaign()`
  wraps `runTracking()`, computes a per-engine breakdown and a competitor
  comparison (relative share-of-voice), and returns a `CampaignRun` that can be
  appended to a store. Determinism preserved via injectable `now`/`idFactory`.
- **Share-of-voice across prompts + engines** is the existing `shareOfVoice()`
  aggregate (every brand, over every response = prompt × engine); the campaign
  layer surfaces it plus a head-to-head competitor gap.
- **Trends** are pure functions over a campaign's run history (`computeTrend`),
  fixture-tested independently of the store.
- **Gemini adapter** mirrors the existing adapter contract (injectable `fetch`,
  `withRetry`, typed error, env-key-gated, defensive parsing). Citations come
  from Google-Search grounding metadata. Env `GEMINI_API_KEY` (fallback
  `GOOGLE_API_KEY`), model `GEMINI_MODEL` (default `gemini-2.0-flash`).
- **Export** is dependency-free: a campaign **Markdown** report and a pure-TS
  **PDF** writer (base-14 Helvetica, valid xref — opens in any viewer, fully
  byte-asserted in tests). No native deps, CI-safe, deterministic.
- **Web** stays Tailwind-only, no chart library: trend/breakdown rendered as
  hand-built SVG/`div` charts with `<table>` a11y fallbacks, all strings i18n'd
  across the 9 existing locales. The web persists campaign runs server-side via
  the same `JsonFileStore` (writable FS) and degrades to a single-run view when
  the FS is read-only.
- **Unit tests never hit the network** (injectable fetch); live providers only
  behind env keys; integration tests `skipIf(!key)`. Secrets never committed.

## Milestones → tags (one release per milestone)

| Tag | Milestone | Closes goal item |
|---|---|---|
| **v0.5.0** | Persisted store + campaigns/prompt-sets + competitor share-of-voice (engine + CLI + API) | 1, 2, 3 (CLI/API) |
| **v0.6.0** | Google **Gemini** adapter (4th engine) behind env key | 4 |
| **v0.7.0** | Web dashboard upgrade: SoV trend chart, per-engine breakdown, competitor comparison, per-prompt drill-down; i18n; server-side store | 5, 3 (web) |
| **v0.8.0** | Exportable campaign report — Markdown + PDF (+ web download) | 6 |
| **v0.9.0** | Methodology doc + launch README + vhs demo; packed-build CLI verified | 8 (docs/demo) |
| **v1.0.0** | Multi-agent adversarial review → fix every real finding → regression tests; ≥320 real tests; CI green incl. `next build` | 7, 8 (review) |

---

## M1 — v0.5.0 · Tracking, campaigns & competitor SoV

**Scope**
- `src/store.ts`: `TrackingStore` interface; `InMemoryStore`; `JsonFileStore`
  (atomic write, lazy load, schema-versioned file).
- `src/campaign.ts`: `Campaign`, `CampaignRun`, `EngineBreakdownEntry`,
  `CompetitorComparisonEntry`; `runCampaign()`, `engineBreakdown()`,
  `competitorComparison()`.
- `src/trends.ts`: `computeTrend()`, `TrendPoint` (visibility + per-brand SoV +
  per-engine score over time).
- `src/demo.ts`: a `demoCampaign` + deterministic `demoCampaignHistory` (sample
  multi-run series) for demos/web.
- CLI: `campaign run|list|history|export` subcommands; legacy flags preserved.
- API (`src/api/scan.ts`): `POST /api/campaign` (run + persist + return history),
  `GET /api/campaign/:id` (history). Auth + rate-limit reuse existing path.
- Exports wired through `index.ts` and `web.ts`.

**Definition of Done** — ✅ shipped (tag v0.5.0)
- [x] `runCampaign` returns a report whose `shareOfVoice` aggregates across all
      prompts × engines, plus a competitor comparison with a non-trivial gap.
- [x] `JsonFileStore` round-trips runs to disk; appending a second run preserves
      the first; reload from a fresh instance returns both (temp-file tested).
- [x] `computeTrend` over ≥2 runs yields an ordered series; fixture-tested.
- [x] CLI `campaign run --demo` then `campaign history` shows ≥1 run. API
      endpoints (`POST /api/campaign`, `GET /api/campaign/:id`) return persisted
      history + trend. End-to-end verified against MockProvider via the dist
      build (CLI + booted server). (`--export` lands in M4.)
- [x] Engine (248✓/3 skip) + web (118✓) suites green; typecheck + both builds
      green; no network in units.

## M2 — v0.6.0 · Gemini adapter

**Scope** `src/providers/gemini.ts` (`GeminiProvider`, `GeminiApiError`,
`extractTextAndCitations`), wired into CLI `--provider gemini`, API
`buildProviders`, `index.ts`/`web.ts`. `.env.example` + README updated.

**Definition of Done**
- [ ] Fixture unit tests: text + grounding-citation extraction, dedupe, empty/
      malformed-200 (no throw, no retry), 4xx no-retry, 5xx retry/backoff,
      request shape (key, model, `google_search` tool), env-key requirement.
- [ ] `skipIf(!GEMINI_API_KEY)` integration test added to the live suite.
- [ ] Selectable from CLI + API + library; build/typecheck/tests green.

## M3 — v0.7.0 · Web dashboard upgrade

**Scope** A campaign dashboard (trend chart of SoV over time, per-engine
breakdown, competitor comparison, expandable per-prompt drill-down with all
citations). Tailwind-only SVG/div charts + `<table>` fallbacks. All new strings
added to all 9 locales. Server-side persistence via `JsonFileStore`; demo works
keyless and accumulates history on repeat runs; single-run degradation noted.

**Definition of Done**
- [ ] Trend chart renders a multi-point series and a single-point series without
      error; a11y `<table>` fallback present.
- [ ] Per-engine breakdown + competitor comparison + drill-down render from real
      mapped data; i18n keys exist in every locale (test asserts parity).
- [ ] `next build` green; web suite green; mobile layout intact.

## M4 — v0.8.0 · Exportable campaign report

**Scope** `src/export/markdown.ts` (`renderCampaignMarkdown`) and
`src/export/pdf.ts` (`renderCampaignPdf` → bytes). CLI `campaign export
--format md|pdf --out <file>`. Optional web download of the current run.

**Definition of Done**
- [ ] Markdown export contains score, trend, engine breakdown, competitor
      comparison, per-prompt table — asserted.
- [ ] PDF bytes start `%PDF-`, end `%%EOF`, carry a valid xref whose offsets
      point at real objects, and embed the brand name + score text — asserted.
- [ ] CLI writes both formats; round-trip verified end-to-end.

## M5 — v0.9.0 · Methodology + launch docs + demo

**Scope** `METHODOLOGY.md` (score + SoV math, trend semantics, limitations);
launch-grade README (campaigns, store, trends, Gemini, export, 4 engines);
`docs/demo.tape` + recorded artifact; verify CLI from `npm pack` tarball.

**Definition of Done**
- [ ] METHODOLOGY.md explains every number the tool reports and its limits.
- [ ] README reflects v1.0 surface; demo artifact committed/referenced.
- [ ] Packed build (`npm pack` → install → `gh-ai-rank-tracker --demo`) runs.

## M6 — v1.0.0 · Adversarial review + release

**Scope** Multi-agent adversarial review (correctness, security, tests-assert-
real-behavior, packaging, docs-match-code). Fix every real finding; add a
regression test per fix. Confirm ≥320 real passing tests engine+web, CI green
incl. `next build`, packed-build CLI verified. Bump to 1.0.0, tag, push.

**Definition of Done**
- [ ] Every confirmed finding fixed with a regression test.
- [ ] Reviewer confirms no padding — every test asserts real behavior.
- [ ] All gates green; `v1.0.0` tagged and pushed; STATUS.md final.

## Constraints (carried from the goal)

- Spec-first: update this file's milestone + DoD before each milestone.
- Every feature ships with a test asserting **real behavior** (no padding).
- Verify each slice by building, running the full suite, and exercising the
  CLI/API against MockProvider end-to-end before moving on.
- Keep the TypeScript / Hono / Next.js stack; conventional commits; push to
  `main`; STATUS.md current. Secrets via env only, documented; **do not publish
  to npm** (left to the maintainer).
