# STATUS — v0.4.0

Living status log for the v0.4.0 effort (live answer-engine adapters). Newest
entries at the top. See [PLAN.md](PLAN.md) for the full gap analysis.

## Current state
- **Phase:** 1/9 — planning + test-infra repair.
- **Build:** root + web deps installed.
- **Tests:** RED on main at start (pre-existing). Repair in progress — see PLAN.md §2.

## Decisions
- **Test layout:** web-coupled tests (`tests/web/**`) move into `web/tests/**`
  so they run under the web project with its deps (`zod`, `next`) and aliases
  (`@`, `@engine`). Root project stays pure engine/API. This makes the
  two-job CI split natural.
- **vitest 4:** `environmentMatchGlobs` is gone; root runner is node-only after
  the move, web runner is jsdom with `globals: true`.
- **4 red backend tests are test-expectation bugs, not code bugs** — the engine
  behaviour (brand-from-DNS-label, strict `>` sliding window, Hono sync
  `app.request`) is correct; the assertions were wrong. Fixed in the tests.
- **Push to main** directly (per goal), conventional commits, tag at the end.
- **Lint gate:** no ESLint configured; `tsc --noEmit` (typecheck) is the static
  gate in CI. Adding ESLint now would introduce churn/risk without value.

## Checklist
- [ ] 1. PLAN.md + STATUS.md
- [ ] 2. Test-infra repair (both suites green)
- [ ] 3. OpenAI + Anthropic adapters wired (CLI, API, index)
- [ ] 4. Unit (fixture) + integration (skip-without-key) tests
- [ ] 5. Merge w4 / obs-2 / w5 html-lang / w5 contrast; close PRs + delete branches
- [ ] 6. Close issues #2 (obs-2) and #4 (locale verified)
- [ ] 7. CI workflow green
- [ ] 8. README env setup + demo-recording step
- [ ] 9. Adversarial review → tag v0.4.0 → push
