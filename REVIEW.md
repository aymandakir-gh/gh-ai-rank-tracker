# v1.0.0 Adversarial Review

Before tagging `v1.0.0` the codebase went through a **multi-agent adversarial
review** (the rigor the PRD/goal requires). This document records what was run,
what was confirmed, and how each finding was resolved — so the release is
auditable.

## How it was run

A workflow fanned out **7 independent reviewers**, one per dimension, then
**adversarially verified every finding** with a separate skeptic agent prompted
to *refute* it (default: not-a-defect unless independently reproduced against the
code). Only findings that survived refutation were actioned.

| Dimension | Focus |
|---|---|
| engine-correctness | scoring, detection, campaign, trends, store math/edge cases |
| export-pdf | PDF xref/offset validity, escaping, pagination; Markdown tables |
| api-security | auth, rate-limit, validation, info leakage, DoS, prototype pollution |
| providers | retry/parse separation, citation extraction, Gemini grounding |
| web | RSC boundaries, i18n parity, a11y, SVG math, XSS, capture proxy |
| tests-padding | every test must assert real behavior (no tautologies) |
| docs-match-code | README/METHODOLOGY claims vs actual defaults/env/CLI |

**Result:** 17 raw findings → **12 confirmed, 5 refuted**. A second
**fix-verification pass** then re-checked every fix for correctness + regressions.

## Confirmed findings & resolutions (all fixed, each with a regression test)

| # | Sev | Area | Finding | Fix | Regression test |
|---|---|---|---|---|---|
| 1 | high | `store.ts` | Concurrent writes on one instance raced on a shared `.tmp` → ENOENT (reachable via concurrent `/api/campaign`) | Per-instance write **queue** (serialized flushes) + unique temp filename + cached load promise | `store.test.ts` "many concurrent writes … without ENOENT" |
| 2 | low | `detect.ts` | `detectMention` double-counted when one term is a sub-token of another (e.g. `Cal` + `Cal.com`) | Collect all match spans, **merge overlapping** before counting | `detect.test.ts` overlap + separate-occurrence cases |
| 3 | med | `export/markdown.ts` | Newline in a cell value split the table row; `\|` double-escaped | `escapeCell`: backslash→pipe→collapse `[\r\n]+`; same on `report.ts` | `export.test.ts` newline/pipe row-integrity |
| 4 | low | `export/markdown.ts` | Newline in brand/campaign/recommendation split headings/bold | `inline()` collapses line breaks in non-table interpolations | (covered by the same export test) |
| 5 | high | `api/scan.ts` | Rate limiter trusted the **leftmost** (spoofable) X-Forwarded-For → trivial bypass | `resolveClientIp` reads the right-most entry with configurable `proxyHops` (default 1) | `api.hardening.test.ts` spoof-bucket + `resolveClientIp` units |
| 6 | med | `api/scan.ts` | No body-size limit, no prompt-count cap, Aegis 8 KB joined-probe truncation → authenticated DoS / fan-out / screening evasion | `MAX_CAMPAIGN_PROMPTS=50`, Content-Length `413` guard, **per-prompt** Aegis scan | `api.hardening.test.ts` cap/413/per-prompt cases |
| 7 | low | `api/scan.ts` | Provider/runtime error text forwarded verbatim (info exposure) | `providerBuildMessage` hides key-config (keeps "Unknown provider"); `safeRunError` logs + returns generic | `api.hardening.test.ts` provider-message cases |
| 8 | low | `web/lib/report-markdown.ts` | Same table-cell newline issue on the web download | `escapePipe` escapes backslash+pipe+collapses newlines | `report-markdown.test.ts` newline case |
| 9 | low | `web/app/api/campaign/route.ts` | Rate-limit key leftmost-spoofable + `127.0.0.1` collapse | `clientIp` reads right-most entry; returns `unknown` when absent | (route + `clientIp` logic) |
| 10 | med | `web/tests/results.test.tsx` | "valid format clears fieldError" asserted nothing (tautology) | Rewritten to resubmit a valid email and assert the alert clears + success | the rewritten test itself |
| 11 | low | `web/tests/email-gate.interactions.test.tsx` | "trimmed email" supplied no whitespace → didn't exercise `.trim()` | Types `"  user@example.com  "` | the fixed test |
| 12 | med | `README.md` | Web "Local development" wrong: port 3001, "proxies to the API", `SCAN_API_URL` | Corrected to port 3003, in-process engine, real env vars | n/a (docs) |

Two cosmetic doc/comment inaccuracies the verifier *refuted* as non-defects were
fixed anyway while in the file (the stale `(v0.3)` API label and an
unconditional Aegis comment).

## Refuted (correctly — no change)

- "Aegis off by default in prod is a defect" — it is documented, tested, opt-in
  defense-in-depth; the always-on controls (auth, rate-limit, validation) stand.
- "Gemini `looksLikeDomain` false-positives on filenames" — premised on inputs
  Gemini's grounding titles don't actually emit; redirect URLs never match a
  brand domain anyway.
- "analytics suite asserts file text" / "lead-route trim test" — weak-test
  observations, but the trim test does fail if `.trim()` is removed (zod
  `.email()` rejects padded input), and the grep tests duplicate real runtime
  coverage; neither is a defect.

## Post-fix gates

Engine **291 passing + 4 skipped**, web **143 passing** (434 total, 0 padding),
typecheck + CommonJS build + `next build` all green, concurrent-write fix
verified end-to-end against the booted server, and the packed (`npm pack`) build
runs the CLI + exposes the library API.
