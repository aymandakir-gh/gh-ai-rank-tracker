'use client'

/**
 * EmailGate — email capture modal shown after scan results render.
 *
 * Features:
 *  - 3 copy variants (A / B / C) driven by `variant` prop
 *  - Focus trap: Tab/Shift+Tab cycles within modal; Escape closes
 *  - aria-modal="true" + role="dialog" + aria-labelledby
 *  - Backdrop click closes modal
 *  - POST /api/lead with graceful fallback on network error
 *  - Inline confirmation + error states (no page reload)
 *  - Dark-mode Tailwind only; no custom CSS
 *  - [DOMAIN] personalization from `domain` prop
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
} from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailGateVariant = 'a' | 'b' | 'c'
type GatePhase = 'idle' | 'submitting' | 'success' | 'error'

export interface EmailGateProps {
  /** Scanned domain, e.g. "acme.com" */
  domain: string
  /** Integer 0–100 visibility score */
  score: number
  /** Which copy variant to display */
  variant: EmailGateVariant
  /** Called when the modal should close (Escape / backdrop / after success) */
  onClose: () => void
  /** Called after a successful lead submission */
  onSuccess?: (email: string) => void
}

// ─── Copy variants ────────────────────────────────────────────────────────────

interface VariantCopy {
  title: string
  subtitle: (domain: string) => string
  placeholder: string
  cta: string
  reassurance: string
}

const VARIANTS: Record<EmailGateVariant, VariantCopy> = {
  a: {
    title: 'Your full AI Visibility Report is ready.',
    subtitle: (d) =>
      `Enter your email to receive the complete breakdown — citation rates per engine, context accuracy, gaps, and a ranked list of improvements for ${d}.`,
    placeholder: 'Work email',
    cta: 'Send me the full report →',
    reassurance: 'Free. Delivered instantly. No spam.',
  },
  b: {
    title: 'The score is one number. The breakdown is where you act.',
    subtitle: (d) =>
      `Enter your email to see how each engine — ChatGPT, Perplexity, Gemini — is covering ${d}, which queries you're missing, and the 3 highest-impact fixes.`,
    placeholder: 'Work email address',
    cta: 'Get the full breakdown →',
    reassurance: "We'll send the report instantly. Unsubscribe anytime.",
  },
  c: {
    title: 'Know where you stand — and where competitors have the edge.',
    subtitle: (d) =>
      `Enter your email for the complete per-engine analysis: citation rates, position in answers, context accuracy, and a prioritized fix list for ${d}.`,
    placeholder: 'Your email',
    cta: 'Get my AI Visibility Report →',
    reassurance: 'Free. No account required. Unsubscribe anytime.',
  },
}

// ─── Focus trap helpers ───────────────────────────────────────────────────────

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EmailGate({
  domain,
  score,
  variant,
  onClose,
  onSuccess,
}: EmailGateProps) {
  const copy = VARIANTS[variant]
  const titleId = 'email-gate-title'

  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [phase, setPhase] = useState<GatePhase>('idle')
  const [serverError, setServerError] = useState('')

  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Auto-focus email input on mount ─────────────────────────────────────
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // ── Escape key handler ───────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // ── Lock body scroll while modal open ───────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // ── Focus trap on Tab / Shift+Tab ────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Tab') return
      const focusable = dialogRef.current ? getFocusable(dialogRef.current) : []
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    },
    [],
  )

  // ── Email validation ─────────────────────────────────────────────────────
  function validateEmail(val: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setEmailError('')
    setServerError('')

    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address.')
      inputRef.current?.focus()
      return
    }

    setPhase('submitting')

    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          source: 'ai-rank-tracker',
          metadata: { domain, score, variant },
        }),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `Server error ${res.status}`)
      }

      setPhase('success')
      onSuccess?.(email.trim())
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong.')
      setPhase('error')
    }
  }

  // ── Backdrop click ────────────────────────────────────────────────────────
  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={handleBackdropClick}
      aria-hidden="false"
    >
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className={[
          'relative w-full max-w-md rounded-2xl border border-slate-700',
          'bg-[#0d1120] p-6 shadow-2xl',
          'animate-fade-in',
        ].join(' ')}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={[
            'absolute right-4 top-4 flex h-8 w-8 items-center justify-center',
            'rounded-full text-slate-400 transition',
            'hover:bg-slate-800 hover:text-white',
          ].join(' ')}
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* ── Success state ─────────────────────────────────────────────── */}
        {phase === 'success' ? (
          <SuccessState domain={domain} onClose={onClose} />
        ) : (
          <>
            {/* Score badge */}
            <div className="mb-5 flex items-center gap-3">
              <ScoreBadge score={score} />
              <span className="text-sm text-slate-400">{domain}</span>
            </div>

            {/* Headline */}
            <h2
              id={titleId}
              className="mb-2 text-lg font-bold leading-snug text-white"
            >
              {copy.title}
            </h2>

            {/* Subtitle */}
            <p className="mb-5 text-sm leading-relaxed text-slate-400">
              {copy.subtitle(domain)}
            </p>

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-4">
                <label htmlFor="gate-email" className="sr-only">
                  Email address
                </label>
                <input
                  ref={inputRef}
                  id="gate-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (emailError) setEmailError('')
                    if (phase === 'error') setPhase('idle')
                  }}
                  placeholder={copy.placeholder}
                  required
                  aria-required="true"
                  aria-invalid={emailError ? 'true' : undefined}
                  aria-describedby={emailError ? 'gate-email-error' : undefined}
                  className={[
                    'w-full rounded-xl border bg-slate-800/80 px-4 py-3',
                    'text-white placeholder-slate-500 outline-none transition',
                    'focus:ring-2 focus:ring-[#5c68f5]',
                    emailError
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-slate-700 hover:border-slate-600',
                  ].join(' ')}
                />
                {emailError && (
                  <p
                    id="gate-email-error"
                    role="alert"
                    className="mt-1.5 text-sm text-red-400"
                  >
                    {emailError}
                  </p>
                )}
              </div>

              {/* Server error */}
              {phase === 'error' && serverError && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400"
                >
                  <strong>Something went wrong.</strong>{' '}
                  <span className="text-slate-400">
                    Check that your email is correct, then try again. Your scan results are saved.
                  </span>
                </div>
              )}

              {/* CTA button */}
              <button
                type="submit"
                disabled={phase === 'submitting'}
                aria-busy={phase === 'submitting'}
                className={[
                  'w-full rounded-xl bg-[#4645e8] px-6 py-3.5 font-semibold text-white',
                  'transition hover:bg-[#5c68f5] active:scale-95',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                ].join(' ')}
              >
                {phase === 'submitting' ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner />
                    Sending…
                  </span>
                ) : (
                  copy.cta
                )}
              </button>
            </form>

            {/* Reassurance */}
            <p className="mt-3 text-center text-xs text-slate-500">
              {copy.reassurance}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10'
    : score >= 40 ? 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10'
    : 'text-red-400 border-red-400/30 bg-red-400/10'

  return (
    <div
      className={`inline-flex items-baseline gap-1 rounded-lg border px-3 py-1 ${color}`}
    >
      <span className="text-2xl font-black tabular-nums leading-none">{score}</span>
      <span className="text-xs font-medium opacity-70">/100</span>
    </div>
  )
}

interface SuccessStateProps {
  domain: string
  onClose: () => void
}

function SuccessState({ domain, onClose }: SuccessStateProps) {
  return (
    <div className="py-2 text-center">
      {/* Checkmark */}
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6 text-emerald-400"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>

      <h2 className="mb-1 text-lg font-bold text-white">Report on its way.</h2>
      <p className="mb-6 text-sm text-slate-400">
        Check your inbox for{' '}
        <span className="font-medium text-slate-300">{domain}</span>'s full AI
        Visibility breakdown. The email includes your per-engine citation rates,
        gaps, and ranked recommendations.
      </p>

      <button
        onClick={onClose}
        autoFocus
        className="rounded-xl border border-slate-700 px-6 py-2.5 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
      >
        Done. Check your inbox.
      </button>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
