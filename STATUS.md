# STATUS — v1.0.0 🚀

Roadmap v0.5.0 → v1.0.0 is specified in [PRD.md](PRD.md). Newest entries on top.
v0.4.0 history is in [PLAN.md](PLAN.md). The v1.0 review is in [REVIEW.md](REVIEW.md).

## Release: v1.0.0 ✅ — Launch

All eight goal items shipped across v0.5.0 → v1.0.0, CI green at every tag:

1. **Tracking over time** — `JsonFileStore` (local-first JSON, atomic + serialized
   writes) + `InMemoryStore` behind a `TrackingStore` interface.
2. **Prompt sets / campaigns** — `Campaign` + `runCampaign`; share-of-voice
   aggregated across prompts × engines.
3. **Competitor comparison** — head-to-head SoV gap, surfaced in CLI + API + web.
4. **4th engine** — Google **Gemini** adapter (grounding citations) behind an env key.
5. **Web dashboard** — SoV trend chart, per-engine breakdown, competitor
   comparison, per-prompt drill-down; i18n (9 locales); self-contained.
6. **Exportable report** — Markdown + a dependency-free pure-TS **PDF**.
7. **≥320 real tests** — **439 passing** (engine 296 + 4 skipped, web 143); a
   reviewer pass confirmed no padding.
8. **Docs + demo + review** — [METHODOLOGY.md](METHODOLOGY.md), launch README,
   `docs/demo.tape` + `docs/demo.txt`, packed-build CLI verified, and a
   multi-agent adversarial review ([REVIEW.md](REVIEW.md)) whose 12 + 4 findings
   were all fixed with regression tests.

**Release gates (v1.0.0):** typecheck (engine + web) ✓ · CommonJS build ✓ ·
`next build` ✓ · engine 296✓/4 skip · web 143✓ · concurrent-write fix verified
on the booted server ✓ · `npm pack` → install → bin + library API verified ✓.

## Release: v0.9.0 ✅ — Methodology, launch docs & demo

- **Goal met (item 8, docs/demo).** Launch-grade documentation:
  - **[METHODOLOGY.md](METHODOLOGY.md)** — the exact math behind the visibility
    score (35/20/30/15 weights, prominence floors, rank prominence),
    share-of-voice (presence-based, across prompts × engines), per-engine
    breakdown and trend deltas, plus 8 documented limitations.
  - **README** rewritten for the v1.0 surface: campaigns + local-first store,
    trends, 4 engines (incl. Gemini), Markdown/PDF export, web dashboard, and a
    methodology link.
  - **Demo:** a runnable `docs/demo.tape` (vhs) + a real captured
    `docs/demo.txt` transcript (vhs/asciinema aren't installed here, so the GIF
    is produced by running the tape).
- **Packed-build CLI verified:** `npm pack` → install the tarball in a clean temp
  project → the installed `gh-ai-rank-tracker` bin runs `--help`, `--demo` and
  `campaign run`; `require('gh-ai-rank-tracker')` exposes `runCampaign`,
  `JsonFileStore`, `GeminiProvider`, `renderCampaignPdf`.
- No code change → engine **275 + 4 skip**, web **142** unchanged; CI green.

## Release: v0.8.0 ✅ — Exportable campaign report (Markdown + PDF)

- **Goal met (item 6).** Two exporters over a `CampaignRun` + `Trend`:
  - `renderCampaignMarkdown` — score, SoV trend, per-engine breakdown,
    competitor comparison, per-prompt table, recommendations.
  - `renderCampaignPdf` — a **dependency-free, pure-TS PDF writer**
    (`buildTextPdf`): base-14 Helvetica, multi-page pagination, ASCII-sanitized
    text, and a cross-reference table whose byte offsets each point at the real
    object. `file(1)` recognizes the output as a valid PDF 1.4.
- **CLI:** `campaign export <id> --format md|pdf --out <file> [--store]`.
- **Web bonus:** dashboard "Download report (.md)" button (i18n'd, 9 locales)
  backed by `webCampaignToMarkdown` (operates on the mapped result; no engine
  internals in the browser bundle).
- **Tests:** +9 engine (`export.test.ts`, incl. xref-offset validation +
  pagination + stream-length checks) → engine **275 + 4 skip**; +4 web
  (`report-markdown`, download wiring) → web **142**. Verified end-to-end from
  the dist build (wrote real `.md` + `.pdf`; `file` confirmed the PDF).

## Release: v0.7.0 ✅ — Web campaign dashboard (trends/engines/competitors/drill-down)

- **Goal met (item 5 + web part of 3).** New `/campaign` dashboard: a
  share-of-voice **trend chart** over time, a **per-engine breakdown**, a
  **competitor comparison**, and an expandable **per-prompt drill-down** (with
  recovered citation URLs). Tailwind-only SVG/`div` charts + a `<table>` a11y
  fallback (no chart library).
- **i18n:** 32 new `campaign.*` keys across all **9 locales**; keys are declared
  once and shared so locale parity holds by construction (asserted by the i18n
  test). `/campaign` is fully translated via `?lang=` with a language selector
  (incl. RTL for Arabic).
- **Self-contained:** `POST /api/campaign` runs the engine in-process. Demo mode
  replays the deterministic 4-week history (a real, engine-scored rising trend);
  custom mode runs once offline (single trend point). Stateless → runs anywhere
  (incl. serverless); persistent history lives in the CLI/Hono-API store (M1).
- **Tests:** +20 web (`campaign-mapper`, `campaign-route`, `trend-chart`,
  `campaign-dashboard`) → web **138 passing**; engine **266 + 4 skip**.
  Typecheck + `next build` green. Verified end-to-end on a running `next start`
  server (demo trend 34→92 over 4 points; custom single run).

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
