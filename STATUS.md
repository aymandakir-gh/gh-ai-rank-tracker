# STATUS

Roadmap v0.5.0 → v1.0.0 is specified in [PRD.md](PRD.md). Newest entries on top.
v0.4.0 history is in [PLAN.md](PLAN.md).

## Release: v0.6.0 ✅ — Google Gemini adapter (4th engine)

- **Goal met (item 4).** `GeminiProvider` (generateContent + `google_search`
  grounding) mirrors the existing adapter contract: injectable `fetch`,
  `withRetry` (5xx/network retry, 4xx no-retry), typed `GeminiApiError`,
  defensive parsing, env-key gated (`GEMINI_API_KEY` → `GOOGLE_API_KEY`).
- **Citations:** grounding chunks → `{ url, title }`; a domain-shaped grounding
  `title` maps to `https://<domain>` so brand-domain citation detection works,
  falling back to the raw redirect URL otherwise.
- **Wired:** CLI `--provider gemini`, API `buildProviders` (scan + campaign),
  `index.ts` exports, `.env.example`, README provider table + roadmap.
- **Tests:** +18 fixture units (`tests/providers.gemini.test.ts`) + a
  `skipIf(!GEMINI_API_KEY)` live integration test → engine **266 passing +
  4 skipped**; web **118 passing**. Typecheck + both builds green. CLI no-key
  error path verified against the dist build.

## Release: v0.5.0 ✅ — Tracking, campaigns & competitor SoV

- **Goal met (items 1–3, CLI/API).** A local-first persisted store, multi-prompt
  campaigns, share-of-voice aggregated across prompts × engines, and a
  head-to-head competitor comparison — all surfaced in the CLI and the API.
- **Tests:** engine **248 passing + 3 skipped** (was 208), web **118 passing**.
  Typecheck, CommonJS build, and `next build` all green.
- **Runtime verified (dist build):** `campaign run/list/history` persist to a
  real JSON file across invocations; booted `server.js` runs + persists campaign
  runs over `POST /api/campaign` and serves `GET /api/campaign/:id` history+trend.

### What shipped
- **`src/store.ts`** — `TrackingStore` interface; `InMemoryStore`; `JsonFileStore`
  (lazy load, atomic temp-file→rename write, version-stamped JSON, empty-on-ENOENT).
  `defaultStorePath()` (`$TRACKER_STORE_PATH` → `./.tracker/store.json`),
  `openStore()`.
- **`src/campaign.ts`** — `Campaign`, `CampaignRun`, `EngineBreakdownEntry`,
  `CompetitorComparisonEntry`; `runCampaign()` (wraps `runTracking`, injectable
  `now`/`idFactory`), `engineBreakdown()`, `competitorComparison()` (SoV gap vs
  the tracked brand).
- **`src/trends.ts`** — `computeTrend()` → ordered `TrendPoint[]` (visibility +
  per-brand SoV + per-engine score) with first→last deltas. Pure, fixture-tested.
- **`src/demo.ts`** — `demoCampaign` + `demoProvidersForWeek()` +
  `demoCampaignHistory()` (deterministic 4-week rising-visibility sample, all
  scored by the real engine).
- **CLI** — `campaign run|list|history` subcommands (legacy flags untouched);
  `--store`/`-s`, `--json`, `--markdown`.
- **API** — `POST /api/campaign` (run + persist + return run/history/trend) and
  `GET /api/campaign/:id`; shared auth + rate-limit gate; Aegis screens campaign
  prompt text. `server.ts` injects a `JsonFileStore`.
- **Wiring** — exported via `index.ts` (+ API types) and `web.ts` (store kept
  server-only). `.env.example` + `.gitignore` updated for the store.

### Tests added
- `tests/campaign.test.ts` (8), `tests/store.test.ts` (shared contract ×2 +
  file-specific), `tests/trends.test.ts` (5), `tests/api.campaign.test.ts` (15).

## Next
- v0.6.0 — Google Gemini adapter (4th engine).
- v0.7.0 — Web dashboard: SoV trend chart, per-engine breakdown, competitor
  comparison, per-prompt drill-down (i18n).
- v0.8.0 — Exportable campaign report (Markdown + PDF).
- v0.9.0 — Methodology doc + launch README + vhs demo.
- v1.0.0 — Adversarial review → fixes → regression tests → release.
