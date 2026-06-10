'use client';

/**
 * M3 Results Page — displays a WebScanResult decoded from the ?r= URL param.
 *
 * Architecture:
 *  - ResultsPage wraps ResultsContent in a Suspense boundary (required when
 *    using useSearchParams() in Next.js 14 App Router)
 *  - No localStorage; all data lives in the URL param
 *  - Share button → WCAG 2.1 AA email-gate modal → clipboard copy
 */

import {
  Suspense,
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  FormEvent,
} from 'react';
import { useSearchParams } from 'next/navigation';
import type { WebScanResult, EmailGateState } from '@/lib/types';

// ─── URL codec ────────────────────────────────────────────────────────────────

/**
 * Decode a Unicode-safe base64 result token from the URL.
 * Encoding counterpart lives in app/page.tsx → encodeResult().
 */
function decodeResult(param: string | null): WebScanResult | null {
  if (!param) return null;
  try {
    const binary = atob(param);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as WebScanResult;
  } catch {
    return null;
  }
}

// ─── Style helpers ────────────────────────────────────────────────────────────

function scoreTextColor(score: number): string {
  if (score >= 70) return 'text-emerald-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function scoreStrokeClass(score: number): string {
  if (score >= 70) return 'stroke-emerald-400';
  if (score >= 40) return 'stroke-yellow-400';
  return 'stroke-red-400';
}

function priorityClass(priority: 'high' | 'medium' | 'low'): string {
  const map: Record<string, string> = {
    high: 'bg-red-500/20 text-red-300 border border-red-500/30',
    medium: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
    low: 'bg-gray-500/20 text-gray-400 border border-gray-500/20',
  };
  return map[priority] ?? map.low;
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 40);
  }
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(1, score / 100) * circ;

  return (
    <svg
      width="136"
      height="136"
      viewBox="0 0 136 136"
      aria-label={`Visibility score: ${score} out of 100`}
      role="img"
    >
      {/* Track */}
      <circle
        cx="68" cy="68" r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="10"
      />
      {/* Progress */}
      <circle
        cx="68" cy="68" r={r}
        fill="none"
        className={scoreStrokeClass(score)}
        stroke="currentColor"
        strokeWidth="10"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 68 68)"
      />
      <text
        x="68" y="62"
        textAnchor="middle"
        fill="white"
        fontSize="28"
        fontWeight="700"
        fontFamily="inherit"
      >
        {score}
      </text>
      <text
        x="68" y="82"
        textAnchor="middle"
        fill="rgba(255,255,255,0.4)"
        fontSize="11"
        fontFamily="inherit"
      >
        / 100
      </text>
    </svg>
  );
}

// ─── Metric Bar ───────────────────────────────────────────────────────────────

function MetricBar({
  label,
  value,
  barClass = 'bg-brand-500',
}: {
  label: string;
  value: number;      // 0–100
  barClass?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(100, value)));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-400">
        <span>{label}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div
          className={`h-full rounded-full ${barClass} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Email Gate Modal (WCAG 2.1 AA) ─────────────────────────────────────────

interface EmailGateModalProps {
  state: EmailGateState;
  onSubmit: (email: string) => void;
  onClose: () => void;
}

function EmailGateModal({ state, onSubmit, onClose }: EmailGateModalProps) {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Auto-focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || focusable.length < 2) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', trap);
    return () => dialog.removeEventListener('keydown', trap);
  }, [state]); // re-run when state changes to update focusable list

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setFieldError('Enter a valid email address');
      inputRef.current?.focus();
      return;
    }
    setFieldError('');
    onSubmit(trimmed);
  };

  const busy = state === 'validating' || state === 'submitting';

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-gate-title"
        aria-describedby="email-gate-desc"
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#111117]
                   p-8 shadow-2xl mx-4"
      >
        {/* Close × */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors
                     w-8 h-8 flex items-center justify-center rounded"
        >
          ✕
        </button>

        {/* Success */}
        {(state === 'success' || state === 'submit_error') ? (
          <div
            className="text-center space-y-4"
            role="status"
            aria-live="polite"
          >
            {state === 'success' ? (
              <>
                <div className="text-5xl" aria-hidden="true">✓</div>
                <p className="text-white font-semibold">Link copied!</p>
                <p className="text-gray-400 text-sm">
                  The results URL has been copied to your clipboard.
                </p>
              </>
            ) : (
              <>
                <div className="text-5xl" aria-hidden="true">⚠</div>
                <p className="text-white font-semibold">Could not copy</p>
                <p className="text-gray-400 text-sm">
                  Clipboard access was denied. Copy the URL from your browser address bar.
                </p>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-brand-500 hover:bg-brand-600 py-2.5 text-sm
                         font-semibold text-white transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          /* Email form */
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <h2
                id="email-gate-title"
                className="text-lg font-semibold text-white mb-1"
              >
                Get your share link
              </h2>
              <p id="email-gate-desc" className="text-gray-400 text-sm">
                Enter your work email to unlock the shareable results URL.
              </p>
            </div>

            <div>
              <label htmlFor="gate-email" className="block text-sm text-gray-300 mb-1">
                Work email
              </label>
              <input
                ref={inputRef}
                id="gate-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                disabled={busy}
                autoComplete="email"
                aria-required="true"
                aria-describedby={fieldError ? 'gate-email-error' : undefined}
                aria-invalid={fieldError ? 'true' : 'false'}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm
                           text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none
                           focus:ring-1 focus:ring-brand-500 disabled:opacity-40 transition-colors"
              />
              {fieldError && (
                <p
                  id="gate-email-error"
                  role="alert"
                  className="mt-1 text-xs text-red-400"
                >
                  {fieldError}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-60
                         py-2.5 text-sm font-semibold text-white transition-colors"
            >
              {busy ? 'Saving…' : 'Copy share link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Results content ─────────────────────────────────────────────────────────

function ResultsContent() {
  const searchParams = useSearchParams();

  const result = useMemo(
    () => decodeResult(searchParams.get('r')),
    [searchParams],
  );

  const [gateState, setGateState] = useState<EmailGateState>('idle');

  const handleShare = useCallback(() => {
    setGateState('modal_open');
  }, []);

  const handleEmailSubmit = useCallback(
    async (email: string) => {
      setGateState('submitting');

      // Fire-and-forget lead capture (fail-open)
      fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          brandName: result?.brandName,
          visibilityScore: result?.visibilityScore,
        }),
      }).catch(() => {/* intentional fail-open */});

      // Copy URL to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href);
        setGateState('success');
      } catch {
        setGateState('submit_error');
      }
    },
    [result],
  );

  const handleCloseGate = useCallback(() => {
    setGateState('idle');
  }, []);

  // ── Invalid / empty result ────────────────────────────────────────────

  if (!result) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-gray-400">
            No results found. The link may be invalid or expired.
          </p>
          <a
            href="/"
            className="inline-block rounded-xl bg-brand-500 hover:bg-brand-600 px-5 py-2
                       text-sm font-semibold text-white transition-colors"
          >
            Run a new scan
          </a>
        </div>
      </main>
    );
  }

  // ── Derived data ──────────────────────────────────────────────────────

  const { breakdown, shareOfVoice = {}, promptResults = [], gaps = [], recommendations = [] } = result;

  const sovEntries = Object.entries(shareOfVoice).sort(([, a], [, b]) => b - a);

  const scoreLabel =
    result.visibilityScore >= 70
      ? 'Strong AI presence — your brand is well-represented.'
      : result.visibilityScore >= 40
      ? 'Moderate visibility — room to improve citation coverage.'
      : 'Low visibility — AI systems rarely mention your brand.';

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-background text-foreground py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Page header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">{result.brandName}</h1>
            <p className="text-gray-500 text-sm mt-1">
              Scanned {new Date(result.scannedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="/"
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300
                         hover:bg-white/5 transition-colors"
            >
              ← New scan
            </a>
            <button
              onClick={handleShare}
              className="rounded-lg bg-brand-500 hover:bg-brand-600 px-3 py-2 text-sm
                         font-semibold text-white transition-colors"
            >
              Share
            </button>
          </div>
        </div>

        {/* ── Score hero ──────────────────────────────────────────────── */}
        <section
          className="rounded-2xl border border-white/10 bg-white/5 p-8
                     flex flex-col sm:flex-row items-center gap-6"
          aria-labelledby="score-heading"
        >
          <ScoreRing score={result.visibilityScore} />
          <div className="flex-1 space-y-2 text-center sm:text-left">
            <h2
              id="score-heading"
              className={`text-5xl font-extrabold ${scoreTextColor(result.visibilityScore)}`}
            >
              {result.visibilityScore}
              <span className="text-xl font-normal text-gray-500 ml-1">/100</span>
            </h2>
            <p className="text-gray-200 text-lg font-medium">AI Visibility Score</p>
            <p className="text-gray-500 text-sm">{scoreLabel}</p>
          </div>
        </section>

        {/* ── Breakdown ───────────────────────────────────────────────── */}
        <section
          className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4"
          aria-labelledby="breakdown-heading"
        >
          <h2
            id="breakdown-heading"
            className="text-xs font-semibold text-gray-400 uppercase tracking-wider"
          >
            Score Breakdown
          </h2>
          <div className="space-y-3">
            <MetricBar
              label="Mention Presence"
              value={breakdown.mentionPresence}
              barClass="bg-brand-500"
            />
            <MetricBar
              label="Mention Prominence"
              value={breakdown.mentionProminence * 100}
              barClass="bg-brand-400"
            />
            <MetricBar
              label="Citation Presence"
              value={breakdown.citationPresence}
              barClass="bg-emerald-500"
            />
            <MetricBar
              label="Citation Prominence"
              value={breakdown.citationProminence * 100}
              barClass="bg-emerald-400"
            />
          </div>
        </section>

        {/* ── Share of Voice ───────────────────────────────────────────── */}
        {sovEntries.length > 0 && (
          <section
            className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4"
            aria-labelledby="sov-heading"
          >
            <h2
              id="sov-heading"
              className="text-xs font-semibold text-gray-400 uppercase tracking-wider"
            >
              Share of Voice
            </h2>
            <div className="space-y-3">
              {sovEntries.map(([brand, share]) => (
                <MetricBar
                  key={brand}
                  label={brand}
                  value={share}   // already 0–100 from mapper
                  barClass={
                    brand === result.brandName ? 'bg-brand-500' : 'bg-gray-600'
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Prompt Results ───────────────────────────────────────────── */}
        {promptResults.length > 0 && (
          <section
            className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4"
            aria-labelledby="prompts-heading"
          >
            <h2
              id="prompts-heading"
              className="text-xs font-semibold text-gray-400 uppercase tracking-wider"
            >
              Prompt Results
            </h2>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-white/5">
                    <th className="pb-2 pr-4 font-medium">Prompt</th>
                    <th className="pb-2 pr-4 font-medium text-right w-16">Score</th>
                    <th className="pb-2 pr-4 font-medium text-right w-20">Mentions</th>
                    <th className="pb-2 font-medium">Top Citation</th>
                  </tr>
                </thead>
                <tbody>
                  {promptResults.map((pr, idx) => {
                    const topCitation = pr.citations[0];
                    return (
                      <tr
                        key={idx}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3 pr-4 text-gray-200 max-w-[200px]">
                          <span className="block truncate" title={pr.prompt}>
                            {pr.prompt}
                          </span>
                        </td>
                        <td
                          className={`py-3 pr-4 text-right font-mono font-semibold
                                     ${scoreTextColor(pr.score)}`}
                        >
                          {Math.round(pr.score)}
                        </td>
                        <td className="py-3 pr-4 text-right text-gray-300 tabular-nums">
                          {pr.mentions}
                        </td>
                        <td className="py-3">
                          {topCitation?.url ? (
                            <a
                              href={topCitation.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-400 hover:text-brand-300 underline
                                         underline-offset-2 block truncate max-w-[180px]"
                              title={topCitation.url}
                            >
                              {safeHostname(topCitation.url)}
                            </a>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Coverage Gaps ────────────────────────────────────────────── */}
        {gaps.length > 0 && (
          <section
            className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-3"
            aria-labelledby="gaps-heading"
          >
            <h2
              id="gaps-heading"
              className="text-xs font-semibold text-gray-400 uppercase tracking-wider"
            >
              Coverage Gaps
            </h2>
            <ul className="space-y-2">
              {gaps.map((gap, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="text-yellow-500 mt-0.5 shrink-0" aria-hidden="true">
                    ▸
                  </span>
                  {gap}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Recommendations ──────────────────────────────────────────── */}
        {recommendations.length > 0 && (
          <section
            className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-3"
            aria-labelledby="recs-heading"
          >
            <h2
              id="recs-heading"
              className="text-xs font-semibold text-gray-400 uppercase tracking-wider"
            >
              Recommendations
            </h2>
            <ul className="space-y-3">
              {recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-gray-300">
                  <span
                    className={`shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-xs font-semibold
                                ${priorityClass(rec.priority)}`}
                  >
                    {rec.priority}
                  </span>
                  {rec.text}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Footer */}
        <div className="text-center pb-8">
          <a
            href="/"
            className="inline-block rounded-xl border border-white/10 px-5 py-2 text-sm
                       text-gray-400 hover:bg-white/5 transition-colors"
          >
            ← Run another scan
          </a>
        </div>

      </div>

      {/* Email gate modal */}
      {gateState !== 'idle' && (
        <EmailGateModal
          state={gateState}
          onSubmit={handleEmailSubmit}
          onClose={handleCloseGate}
        />
      )}
    </main>
  );
}

// ─── Loading fallback ─────────────────────────────────────────────────────────

function LoadingFallback() {
  return (
    <main
      className="min-h-screen bg-background flex items-center justify-center"
      aria-busy="true"
      aria-label="Loading results"
    >
      <div className="flex items-center gap-3 text-gray-400">
        <svg
          className="animate-spin h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12" cy="12" r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
        Loading results…
      </div>
    </main>
  );
}

// ─── Page export (Suspense boundary required for useSearchParams) ─────────────

export default function ResultsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResultsContent />
    </Suspense>
  );
}
