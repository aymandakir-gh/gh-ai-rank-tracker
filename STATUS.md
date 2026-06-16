# STATUS — v0.4.0 ✅

Live answer-engine adapters shipped. See [PLAN.md](PLAN.md) for the original gap
analysis. Newest entries at the top.

## Release: v0.4.0
- **Goal met.** Live OpenAI + Perplexity + Anthropic adapters behind env keys,
  MockProvider kept as the no-key default; skip-without-keys integration tests;
  obs/sentry-posthog branch merged; all open issues + PRs resolved; CI green on
  main; README env setup + demo-recording step. Version bumped to 0.4.0 and
  tagged.
- **Tests:** engine 208 passing + 3 live-integration skipped (no keys); web 118
  passing + `next build` green.
- **Runtime verified:** `node dist/src/cli.js --demo` and `node dist/src/server.js`
  (CommonJS dist) both run end-to-end against MockProvider.

## What shipped
- **Adapters** (`src/providers/`): `OpenAIProvider` (Responses API + web_search),
  `AnthropicProvider` (Messages API + web_search_20260209), `PerplexityProvider`
  (default model → `sonar`). Shared `http.ts#withRetry` (exponential backoff, no
  retry on 4xx, retry only the network call). Web-search citations; defensive
  parsing. Models overridable via `*_MODEL` env vars. Wired into `buildProviders`
  (Hono API), the CLI `--provider`, and `index.ts`.
- **Tests:** fixture-based unit tests (zero network) + `describe.skipIf(!key)`
  integration tests in `tests/providers.integration.test.ts`.
- **Build:** CommonJS `dist` (`tsconfig.build.json` + `dist/package.json` marker)
  so `npm start` / the bin run; `exports` map + `src` dropped from the tarball.
- **Merges:** w4 (rate-limiter prune), obs-2 (Sentry+PostHog), w5 html-lang
  (LangSync), w5 contrast (a11y).
- **CI:** `.github/workflows/ci.yml` — engine (typecheck/build/test) + web
  (typecheck/build/test). Green on main.
- **Docs:** README live-provider env setup, one-line run, vhs/asciinema
  demo-recording step; root `.env.example`.

## Issue / PR disposition
- **#2 OBS-2** — closed; shipped via #1 (Sentry + PostHog, graceful-degrade).
- **#4 locale zh vs zh-cn** — closed verified-correct (`i18n.ts` keys `zh`;
  LangSync matches; misleading docstring fixed).
- **PRs #1/#3/#5/#7** — merged. **PR #6** — closed (superseded by #5). All
  merged/superseded remote branches deleted; only `main` remains.

## Review
- A multi-agent adversarial review confirmed 5 findings before tagging; all
  fixed (retry/parse separation + defensive parsing; Anthropic search-error
  fallback; packaging exports/tarball; web `next build` in CI; dead
  `next.config.ts` removed + source-map guard ported). Re-verified green.

## Checklist
- [x] 1. PLAN.md + STATUS.md
- [x] 2. Test-infra repair (both suites green)
- [x] 3. OpenAI + Anthropic adapters wired (CLI, API, index)
- [x] 4. Unit (fixture) + integration (skip-without-key) tests
- [x] 5. Merge w4 / obs-2 / w5 html-lang / w5 contrast; PRs closed; branches deleted
- [x] 6. Close issues #2 and #4
- [x] 7. CI workflow green on main
- [x] 8. README env setup + demo-recording step
- [x] 9. Adversarial review → fixes → tag v0.4.0
