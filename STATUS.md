# STATUS — v0.4.0

Living status log for the v0.4.0 effort (live answer-engine adapters). Newest
entries at the top. See [PLAN.md](PLAN.md) for the full gap analysis.

## Current state
- **Phase:** finishing — CI + release.
- **Tests:** root 205 passing + 3 integration skipped (no keys); web 118 passing.
- **Build:** `node dist/src/{cli,server}.js` verified end-to-end against MockProvider.
- **Branches merged:** w4 (rate-limiter prune), obs-2 (Sentry+PostHog), w5 html-lang
  (LangSync), w5 contrast (#5). CI workflow added (engine + web jobs).

## Decisions
- **Live adapters** mirror `PerplexityProvider`: injectable `fetch`, exponential
  backoff via shared `src/providers/http.ts#withRetry` (no retry on 4xx), typed
  per-provider error classes. Web-search enabled so answers carry citations.
  Defaults overridable via `OPENAI_MODEL` / `PERPLEXITY_MODEL` / `ANTHROPIC_MODEL`.
  Perplexity default updated `llama-3.1-sonar-*` (retired) → `sonar`.
- **Integration tests** (`tests/providers.integration.test.ts`) make real calls
  but are `describe.skipIf(!key)` — green with no keys, runnable with them. CI
  has no keys → skipped → no paid calls.
- **Runnable build:** `dist` is emitted as CommonJS (`tsconfig.build.json` +
  `dist/package.json` marker) so `npm start` / the `bin` actually run — the
  prior extensionless-ESM emit crashed at runtime. Zero source-import edits;
  typecheck/vitest/web config unchanged.
- **Test layout:** web-coupled tests live under `web/tests/**`; root project is
  pure engine/API. vitest 4 migration (`environmentMatchGlobs` removed). The
  pre-existing red backend tests were test-expectation bugs (engine was correct).
- **Lint gate:** no ESLint; `tsc --noEmit` (typecheck) is the CI static gate.
- **Push to main** directly (per goal), conventional commits, tag at the end.

## Issue / PR disposition
- **#2 OBS-2** — resolved by merging obs-2 (Sentry + PostHog, graceful-degrade,
  tests). Close.
- **#4 locale zh vs zh-cn** — verified: `lib/i18n.ts` keys Chinese as `zh`, and
  `LangSync` SUPPORTED matches. No functional change; fixed the misleading
  "ZH-CN" docstring. Close as verified-correct.
- **PR #7 / #1 / #3 / #5** — merged into main. **PR #6** (contrast-hygiene,
  page.tsx only) is a strict subset of #5 → close as superseded.

## Checklist
- [x] 1. PLAN.md + STATUS.md
- [x] 2. Test-infra repair (both suites green)
- [x] 3. OpenAI + Anthropic adapters wired (CLI, API, index)
- [x] 4. Unit (fixture) + integration (skip-without-key) tests
- [x] 5. Merge w4 / obs-2 / w5 html-lang / w5 contrast
- [ ] 5b. Close PRs + delete branches
- [ ] 6. Close issues #2 and #4
- [x] 7. CI workflow added (pending first green run on push)
- [x] 8. README env setup + demo-recording step
- [ ] 9. Adversarial review → tag v0.4.0 → push
