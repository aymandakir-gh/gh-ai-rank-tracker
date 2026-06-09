# SPEC — gh-ai-rank-tracker M3: Next.js Web Dashboard

**Status:** `#da-validare` — pending W2·Build assignment  
**Milestone:** M3 of 4  
**Owner:** W5·Frontend (spec) → W2·Build (implementation)  
**Date:** 2026-06-09  
**Updated:** 2026-06-09 (W5 run 8 — email gate flow expanded + explicit M3 scope)

---

## TL;DR

Ship a Next.js App Router web UI for `gh-ai-rank-tracker` that lets users configure a brand visibility scan, run it against AI search engines, see their AI Visibility Score + citation breakdown, and share results via a unique URL — closing the loop from awareness to lead capture.

---

## Milestone Map

| M | Scope | Status |
|---|---|---|
| M1 | Core engine + CLI + 33 tests | ✅ Shipped 2026-06-08 |
| M2 | Live provider adapters (Perplexity, OpenAI, Gemini) | 🔄 Queued |
| **M3** | **Next.js web dashboard + email gate lead capture (this spec)** | ⏳ Planned |
| M4 | Scheduled runs + historical trend tracking | ⏳ Backlog |

> M3 can be built on top of the MockProvider (no live API keys required). M2 adapters plug in transparently once shipped.

---

## Objective

- **What:** browser-based UI to configure + run a GEO/AEO brand scan and see results
- **North Star:** email-submitted scans / week (lead capture gate on share)
- **Success criteria:** user can go from URL input → scan config → score + breakdown → shareable link in < 3 minutes, no CLI needed

---

## User Flow

```
Landing (/)
  ↓  enter brand URL / name
ConfigForm
  ↓  add prompts + competitors (optional)
[Run Scan] → POST /api/scan
  ↓  loading state
ResultsView
  ├─ AI Visibility Score (0–100) — hero number
  ├─ Stage breakdown (mention / citation / prominence)
  ├─ Prompt-level table
  ├─ Citation breakdown (which sources cited, at what rank)
  └─ [Share] → email gate modal → POST /api/lead → unique shareable URL
```

---

## Email Gate Flow (M3 scope — explicit)

This is a **first-class M3 deliverable**, not an optional enhancement. It is the NSM driver: every share = one lead captured.

### State Machine

```
idle
  → [Share button click] → modal_open
      → [user types email] → validating (client-side)
          → [invalid email] → validation_error (stay in modal)
          → [valid email] → submitting
              → [POST /api/lead 2xx] → success
                  → generate ?r= URL → copy to clipboard → show confirmation
              → [POST /api/lead 4xx/5xx] → submit_error
                  → show retry message; keep modal open; user can retry
              → [POST /api/lead timeout >8s] → submit_error (same)
  → [Escape / outside click] → idle (modal closed; results still visible)
  → [LEADS_API_URL not configured] → fallback: log to console + open share URL anyway (never block results)
```

### API Contract

```ts
// POST LEADS_API_URL/api/lead
interface LeadPayload {
  email: string;          // required, valid format
  source: "ai-rank-tracker";
  firstName?: string;     // optional — shown in email modal as "Name (optional)"
}

// 200/201 → success; generate shareable URL
// 409 → duplicate (already submitted) — treat as success, don't show error
// 4xx/5xx → show retry; never block results
```

### Shareable URL Generation

```ts
// On successful lead capture:
const token = btoa(JSON.stringify(result));   // base64 encode full WebScanResult
const shareUrl = `${window.location.origin}/results?r=${token}`;
// → copy to clipboard via navigator.clipboard.writeText(shareUrl)
// → fallback: show URL in text field if clipboard API unavailable
```

### Email Gate UI Spec

```
┌──────────────────────────────────────────────────────┐
│  Share your AI Visibility Score                      │
│                                                      │
│  Enter your email to get a shareable link + report   │
│                                                      │
│  Name (optional)  [___________________________]      │
│  Email *          [___________________________]      │
│                   ← inline validation: "valid email" │
│                                                      │
│  [Cancel]                    [Get my shareable link] │
│                                                      │
│  🔒 We'll send you the report. Unsubscribe anytime.  │
└──────────────────────────────────────────────────────┘
```

- Modal: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title
- Focus trap: Tab cycles within modal only; Escape closes
- Submit button: `aria-busy="true"` + spinner while submitting; disabled during in-flight request
- Error state: `role="alert"` message under email field
- Success state: replace modal body with "Link copied! ✓ Share URL: [truncated]"

### Acceptance Criteria (email gate only)

- [ ] Share button is present on ResultsView and keyboard-reachable (Tab + Enter)
- [ ] Modal opens on click; focus moves to first input; Escape closes
- [ ] Client-side validation: empty email + invalid format both show inline error
- [ ] Valid email triggers POST to `LEADS_API_URL/api/lead` with `source: "ai-rank-tracker"`
- [ ] 2xx response: generate `?r=` URL, copy to clipboard, show confirmation in modal
- [ ] 409 (duplicate): treat as success — generate and copy URL, no error shown
- [ ] Network error / timeout: show retry message; modal stays open; results never hidden
- [ ] Missing `LEADS_API_URL` env var: skip POST, log to console, generate URL anyway
- [ ] `firstName` field present but optional — no validation error if blank
- [ ] WCAG 2.1 AA: contrast ≥4.5:1; screen reader announces success/error via `role="alert"`

---

## Pages

### `/` — Scan Config Form

**Purpose:** brand setup + prompt configuration  
**Route:** `app/page.tsx`

#### Props / State

```ts
interface ScanConfig {
  brand: {
    name: string;       // required, min 2 chars
    domain: string;     // required, valid URL/domain
    aliases: string[];  // optional
  };
  prompts: Array<{
    text: string;       // required, min 10 chars
    weight: number;     // 1–3, default 1
  }>;
  competitors: Array<{
    name: string;
    domain: string;
  }>;
}

type FormPhase = "config" | "scanning" | "results";
```

#### UI sections

1. **Hero** — headline + 1-line value prop ("See if AI mentions you. Get your visibility score.")
2. **Brand section** — Name input + Domain input + optional aliases (comma-separated)
3. **Prompts section** — textarea list (1 required, up to 10); weight selector per prompt (Low/Medium/High = 1/2/3)
4. **Competitors section** — optional; up to 5; name + domain per row; "Add competitor" button
5. **[Run Scan] CTA** — validates form → fires POST `/api/scan`; disabled while scanning
6. **Presets** — 3 quick-fill examples ("B2B SaaS agency", "Developer tool", "E-commerce brand") to lower friction

#### Validation

- Brand name: required, 2–80 chars
- Domain: required, valid domain (regex or `URL` constructor)
- Prompts: at least 1; each 10–200 chars
- Competitors: if present, name + domain both required per row
- Show inline error messages under each field (not alert toasts)

---

### `/results` — Score Display

**Purpose:** show scan output, drive share  
**Route:** `app/results/page.tsx` (receives data via state) OR URL token (`?r=<base64>`)

#### Data Shape (from `runTracking` return)

```ts
interface WebScanResult {
  visibilityScore: number;         // 0–100
  breakdown: {
    mentionPresence: number;       // 0–100
    mentionProminence: number;     // 0–100
    citationPresence: number;      // 0–100
    citationProminence: number;    // 0–100
  };
  shareOfVoice: Record<string, number>;   // brand/competitor → score
  gaps: string[];                         // prompts with 0 brand mentions
  recommendations: Array<{
    priority: "high" | "medium" | "low";
    text: string;
  }>;
  promptResults: Array<{
    prompt: string;
    weight: number;
    score: number;
    mentions: number;
    citations: Array<{ url: string; rank: number }>;
  }>;
  brandName: string;
  scannedAt: string;  // ISO timestamp
}
```

#### UI Sections

1. **Score Hero** — large `visibilityScore` number (0–100); color: green ≥70, yellow 40–69, red <40; label + subtitle
2. **Breakdown bars** — 4 horizontal bars (mention presence, mention prominence, citation presence, citation rank); each labeled with score
3. **Share of Voice chart** — horizontal bar chart: brand vs competitors (if any)
4. **Prompt table** — collapsible rows per prompt; columns: Prompt text, Weight, Score, Mentions, Citations
5. **Citation Breakdown** — per prompt: which URLs were cited and at what rank; sorted by rank asc; domain only shown (no full URL)
6. **Top Gaps** — list of prompts where brand has 0 mentions; CTA "Fix these with GEO"
7. **Recommendations** — card list sorted by priority (high → low); icon per priority level
8. **Share CTA** — button "Share my score"; opens email gate modal (see Email Gate Flow above)

#### Email Gate (Share modal) — see dedicated section above

Quick reference:
- POST to `LEADS_API_URL/api/lead` with `source: "ai-rank-tracker"`
- On 2xx: generate `?r=<base64-encoded-result>` → copy to clipboard
- On error: show retry; never block viewing results
- On missing env: fallback to console log + generate URL anyway

---

### `/api/scan` — Scan API Route

**Route:** `app/api/scan/route.ts`  
**Method:** POST  
**Body:**

```ts
interface ScanRequest {
  brand: { name: string; domain: string; aliases?: string[] };
  prompts: Array<{ text: string; weight: number }>;
  competitors?: Array<{ name: string; domain: string }>;
  useDemo?: boolean;   // true → MockProvider (default if no API keys configured)
}
```

**Response:**

```ts
interface ScanResponse {
  ok: boolean;
  result?: WebScanResult;
  error?: string;
}
```

**Implementation notes:**
- Import `runTracking` + `MockProvider` from the core engine (`src/`)
- If `PERPLEXITY_API_KEY` env var present → use live Perplexity adapter (M2)
- Otherwise → fall back to `MockProvider` with scripted answers derived from prompt text
- Timeout: 30s hard cap (Next.js edge timeout)
- Rate limit: 1 scan/IP/10 minutes (simple in-memory map, no persistence needed for MVP)

---

## Responsive Breakpoints (mobile-first)

| Breakpoint | Layout |
|---|---|
| `<640px` (mobile) | Single column; prompt rows stacked; table scrollable horizontally |
| `640–1024px` (tablet) | Two-column form (brand + prompts side by side) |
| `≥1024px` (desktop) | Max-width 1024px centered; breakdown bars inline with labels |

---

## A11y Requirements

- All form inputs: `<label>` associated via `htmlFor` / `id`
- Score hero: `<output>` element with `aria-live="polite"` during scan loading
- Color is never the only indicator: use both color + icon for score thresholds
- Keyboard: Tab through all interactive elements; modals trap focus; Escape closes modals
- Scan loading state: `aria-busy="true"` on the results section; spinner has `role="status"` + sr-only text
- All charts: `<table>` fallback with `sr-only` class for screen readers
- WCAG 2.1 AA minimum contrast for all text
- Email gate modal: `role="dialog"`, focus trap, `role="alert"` for errors/success

---

## Tech Stack

- **Framework:** Next.js 14 App Router, TypeScript strict
- **Styling:** Tailwind CSS only (extend existing `tailwind.config.ts`)
- **State:** React `useState` + URL params; no external state library
- **Charts:** native `<div>` bars with `width` as inline Tailwind style (no chart library for MVP)
- **Share token:** `btoa(JSON.stringify(result))` / `atob` — no server persistence for MVP
- **Lead capture:** `fetch` POST to `LEADS_API_URL` env var (same as gh-growth-score)

---

## Out of Scope (M3)

- Login / auth / user accounts
- Persistent scan history
- Scheduled / recurring scans (M4)
- Email delivery of report (just lead capture for now)
- Live provider adapters (M2 ships separately; M3 uses MockProvider)
- Mobile app
- i18n (EN only for M3)

---

## Environment Variables

```env
# .env.local (M3 additions)
LEADS_API_URL=https://<railway-url>    # gh-leads-core endpoint
PERPLEXITY_API_KEY=                    # optional — triggers live provider
OPENAI_API_KEY=                        # optional
GOOGLE_AI_API_KEY=                     # optional
```

---

## Acceptance Criteria (full M3)

- [ ] User can fill the config form and trigger a scan
- [ ] Results page shows AI Visibility Score + 4 breakdown bars
- [ ] Citation breakdown table shows domain + rank per prompt
- [ ] **Share button opens email gate modal** (see Email Gate Flow section)
- [ ] **Valid email → POST to `LEADS_API_URL` → generate `?r=` URL → copy to clipboard**
- [ ] **409 duplicate → treated as success; no error shown**
- [ ] **Network error → retry message; results never blocked**
- [ ] **Missing `LEADS_API_URL` → fallback: skip POST, generate URL anyway**
- [ ] `npm run build` passes with zero TypeScript errors
- [ ] All interactive elements keyboard-reachable; contrast ≥4.5:1
- [ ] Mobile layout functional at 375px viewport
- [ ] Loading state shown during scan (no blank screen)
- [ ] Email gate modal: focus trap, Escape closes, `role="dialog"` + `aria-modal`

---

## Links

- Core engine: `src/` (TrackingReport, runTracking, MockProvider)
- Lead backend: [gh-leads-core](https://github.com/aymandakir-gh/gh-leads-core) — `POST /api/lead`
- Design reference: gh-growth-score (same dark Tailwind theme, reuse color tokens)
- M2 SPEC (adapters): TBD
