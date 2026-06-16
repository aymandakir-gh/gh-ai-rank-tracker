# PLAN — v0.4.0: live answer-engine adapters

Gap analysis of the current repo (v0.3.0) versus the v0.4.0 goal, plus the
ordered plan to close each gap. Decisions are recorded in commits + STATUS.md.

## Goal (v0.4.0)
Turn the GEO/AEO tracker from a mock demo into a real tool: live OpenAI,
Perplexity and Anthropic adapters behind env API keys, with MockProvider kept as
the no-key default; integration tests that skip without keys and pass with them;
the obs/sentry-posthog branch merged; all open issues resolved; CI green on main;
README with env setup + a demo-recording step; tag `v0.4.0`.

## Where the repo stands today
- **Engine** (`src/`): scoring, detection, share-of-voice, reporting, CLI, Hono
  API — all solid and unit-tested against `MockProvider`.
- **Providers**: `MockProvider` (default) + `PerplexityProvider` (live, clean
  pattern: injectable `fetch`, retry/backoff, typed error, `parseResponse`).
  README calls Perplexity "beta"; OpenAI + Anthropic are **missing**.
- **Web** (`web/`): Next.js UI, i18n (9 locales), results page, email gate.
- **CI**: **none** (`.github/workflows/` is empty).
- **Tests are RED on main** (pre-existing, must fix for green CI):
  - vitest 4 removed `environmentMatchGlobs` → `tests/web/**` React tests run in
    node, not jsdom (`document is not defined`).
  - `web/tests/setup.ts` uses side-effect `import '@testing-library/jest-dom'`
    which needs a global `expect`, but web config has `globals: false`.
  - `tests/web/{scan,lead}-route.test.ts` import web routes (`zod`, `@engine`,
    `@/lib/*`) that cannot resolve under the root runner — misplaced web tests.
  - 4 backend test-expectation bugs (not code bugs): brand `Growthhackers` vs
    `Growthackers`; rate-limiter window-boundary + empty-string-IP expectations;
    a `.then()` chain on Hono's sync `app.request()` (returns `Response`, not a
    Promise).
- **Open branches/PRs**: obs-2 (Sentry+PostHog, web → issue #2 / PR #1), w4
  (rate-limiter `prune()`, backend → PR #7), w5 html-lang (LangSync → PR #3,
  issue #4), w5 contrast ×2 (PR #5 superset of PR #6).
- **Open issues**: #2 (OBS-2 not shipped), #4 (locale `zh` vs `zh-cn`).

## Plan (ordered; verify build+test after every slice)
1. **PLAN.md + STATUS.md** (this commit).
2. **Repair test infrastructure** so both suites are green on a clean base:
   relocate `tests/web/**` → `web/tests/**`; root vitest = single node project
   (`tests/**`, excl. web); web vitest `globals: true` + `@engine` alias; fix the
   4 backend test-expectation bugs; fix 2 typecheck nits.
3. **Live adapters**: `OpenAIProvider` + `AnthropicProvider`, mirroring
   `PerplexityProvider` (injectable `fetch`, retry, typed error). Wire into
   `buildProviders`, CLI `--provider`, and `index.ts`. Promote Perplexity out of
   "beta".
4. **Tests**: fixture-based unit tests (zero network, injectable `fetch`) +
   integration tests gated on `OPENAI_API_KEY` / `PERPLEXITY_API_KEY` /
   `ANTHROPIC_API_KEY` (`describe.skipIf(!key)`), never committing secrets.
5. **Merge branches** (resolve conflicts, verify, close PR + delete branch each):
   w4 → obs-2 → w5 html-lang → w5 contrast (#5; close #6 as superseded).
6. **Resolve issues**: #2 via obs-2; #4 by verifying `zh` is the internal key
   (LangSync correct) and closing with rationale.
7. **CI**: GitHub Actions — engine job (install/typecheck/build/test) + web job
   (install/typecheck/test) on push + PR.
8. **README**: accurate adapter list, env-var setup for all 3 providers,
   one-line run, documented demo-recording step (vhs/asciinema, placeholder).
9. **Final adversarial review**, then tag `v0.4.0` and push.

## Constraints
- Keep the existing TypeScript / Hono / Next.js stack.
- Real network calls live only in provider adapters; unit tests never hit the
  network. API keys are read from env only and never committed.
- Conventional commits; push to `main`; STATUS.md kept current.
