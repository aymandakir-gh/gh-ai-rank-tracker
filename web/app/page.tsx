'use client'

import { useState, useCallback } from 'react'
import type { Locale } from '@/lib/i18n'
import { translations, LOCALE_LABELS, RTL_LOCALES } from '@/lib/i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'scanning' | 'results' | 'error'

interface Coverage {
  totalPrompts: number
  totalResponses: number
  mentionRate: number
  citationRate: number
}

interface Recommendation {
  severity: 'high' | 'medium' | 'low'
  message: string
}

interface ScanResult {
  brand: string
  generatedAt: string
  engines: string[]
  visibilityScore: number
  coverage: Coverage
  gaps: string[]
  recommendations: Recommendation[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<Recommendation['severity'], string> = {
  high: 'text-red-400',
  medium: 'text-yellow-400',
  low: 'text-emerald-400',
}

const SEVERITY_ICON: Record<Recommendation['severity'], string> = {
  high: '🔴',
  medium: '🟡',
  low: '🟢',
}

function scoreTextColor(score: number): string {
  if (score >= 70) return 'text-emerald-400'
  if (score >= 40) return 'text-yellow-400'
  return 'text-red-400'
}

function scoreBorderBg(score: number): string {
  if (score >= 70) return 'border-emerald-400/30 bg-emerald-400/10'
  if (score >= 40) return 'border-yellow-400/30 bg-yellow-400/10'
  return 'border-red-400/30 bg-red-400/10'
}

function validateUrl(val: string): boolean {
  try {
    const u = new URL(val)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [locale, setLocale] = useState<Locale>('en')
  const [url, setUrl] = useState('')
  const [providers, setProviders] = useState<string[]>(['mock'])
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [urlError, setUrlError] = useState('')

  const t = useCallback(
    (key: string): string =>
      translations[locale][key] ?? translations.en[key] ?? key,
    [locale],
  )

  const dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr'

  function toggleProvider(name: string) {
    setProviders((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    )
  }

  async function handleScan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setUrlError('')

    if (!validateUrl(url)) {
      setUrlError(t('scan.validation.url'))
      return
    }
    if (providers.length === 0) {
      setUrlError(t('scan.validation.provider'))
      return
    }

    setPhase('scanning')
    setResult(null)
    setErrorMsg('')

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, providers }),
      })

      const data = (await res.json()) as {
        ok: boolean
        result?: ScanResult
        error?: string
      }

      if (!data.ok || !data.result) {
        throw new Error(data.error ?? 'Unknown error from server')
      }

      setResult(data.result)
      setPhase('results')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Scan failed')
      setPhase('error')
    }
  }

  function handleReset() {
    setPhase('idle')
    setResult(null)
    setErrorMsg('')
    setUrlError('')
  }

  return (
    <div dir={dir} className="min-h-screen bg-[#0a0e1a] text-slate-100">
      {/* Ambient gradient */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(92,104,245,0.12) 0%, transparent 100%)',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-2xl px-4 py-12">
        {/* Nav */}
        <nav className="mb-10 flex items-center justify-between gap-4">
          <div className="min-w-0 flex items-center gap-2">
            <span className="font-bold text-[#7c91fa]">{t('nav.title')}</span>
            <span className="hidden text-sm text-slate-500 sm:inline">{t('nav.tagline')}</span>
          </div>
          <LanguageSelector locale={locale} onChange={setLocale} />
        </nav>

        {/* Hero */}
        <header className="mb-10 text-center">
          <div className="mb-3 inline-block rounded-full bg-[#2c2d83]/50 px-4 py-1.5 text-sm font-medium text-[#a4b8fd]">
            {t('scan.badge')}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {t('scan.hero.title')}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-slate-400">{t('scan.hero.subtitle')}</p>
        </header>

        {/* Scan Form — visible while idle or scanning */}
        {(phase === 'idle' || phase === 'scanning') && (
          <form
            onSubmit={handleScan}
            noValidate
            className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm"
          >
            {/* URL input */}
            <div className="mb-5">
              <label
                htmlFor="brand-url"
                className="mb-1.5 block text-sm font-medium text-slate-300"
              >
                {t('scan.form.url.label')}{' '}
                <span className="text-red-400" aria-hidden="true">*</span>
              </label>
              <input
                id="brand-url"
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  if (urlError) setUrlError('')
                }}
                placeholder={t('scan.form.url.placeholder')}
                required
                autoComplete="url"
                aria-required="true"
                aria-invalid={urlError ? 'true' : undefined}
                aria-describedby={urlError ? 'url-error' : undefined}
                className={[
                  'w-full rounded-lg border bg-slate-800 px-4 py-3 text-white',
                  'placeholder-slate-500 outline-none transition',
                  'focus:ring-2 focus:ring-[#5c68f5]',
                  urlError
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-700 hover:border-slate-600',
                ].join(' ')}
              />
              {urlError && (
                <p id="url-error" role="alert" className="mt-1.5 text-sm text-red-400">
                  {urlError}
                </p>
              )}
            </div>

            {/* Provider checkboxes */}
            <fieldset className="mb-6">
              <legend className="mb-2 text-sm font-medium text-slate-300">
                {t('scan.form.providers.label')}
              </legend>
              <div className="flex flex-wrap gap-3">
                {(['mock', 'perplexity'] as const).map((key) => (
                  <ProviderCheckbox
                    key={key}
                    id={`provider-${key}`}
                    checked={providers.includes(key)}
                    onChange={() => toggleProvider(key)}
                    label={t(`scan.form.providers.${key}`)}
                  />
                ))}
              </div>
            </fieldset>

            {/* CTA */}
            <button
              type="submit"
              disabled={phase === 'scanning'}
              aria-busy={phase === 'scanning'}
              className={[
                'w-full rounded-xl bg-[#4645e8] px-6 py-3.5 font-semibold text-white',
                'transition hover:bg-[#5c68f5] active:scale-95',
                'disabled:cursor-not-allowed disabled:opacity-60',
              ].join(' ')}
            >
              {phase === 'scanning' ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner />
                  {t('scan.scanning')}
                </span>
              ) : (
                t('scan.form.cta')
              )}
            </button>

            {phase === 'scanning' && (
              <p
                role="status"
                aria-live="polite"
                className="mt-3 text-center text-sm text-slate-400"
              >
                {t('scan.scanning.desc')}
              </p>
            )}
          </form>
        )}

        {/* Results */}
        {phase === 'results' && result && (
          <ResultsView result={result} onReset={handleReset} t={t} />
        )}

        {/* Error */}
        {phase === 'error' && (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center"
          >
            <p className="mb-2 font-semibold text-red-400">{t('scan.error.title')}</p>
            <p className="mb-6 text-sm text-slate-400">{errorMsg}</p>
            <button
              onClick={handleReset}
              className="rounded-xl bg-slate-800 px-6 py-3 font-medium text-slate-200 transition hover:bg-slate-700"
            >
              {t('scan.error.retry')}
            </button>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 text-center text-xs text-slate-600">
          Open source · MIT ·{' '}
          <a
            href="https://github.com/aymandakir-gh/gh-ai-rank-tracker"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-400 transition"
          >
            GitHub
          </a>
        </footer>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ProviderCheckboxProps {
  id: string
  checked: boolean
  onChange: () => void
  label: string
}

function ProviderCheckbox({ id, checked, onChange, label }: ProviderCheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={[
        'flex cursor-pointer select-none items-center gap-2 rounded-lg border',
        'px-4 py-2.5 text-sm transition',
        checked
          ? 'border-[#5c68f5] bg-[#2c2d83]/30 text-[#a4b8fd]'
          : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300',
      ].join(' ')}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {/* Custom checkbox visual */}
      <span
        className={[
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border',
          checked ? 'border-[#5c68f5] bg-[#5c68f5]' : 'border-slate-600',
        ].join(' ')}
        aria-hidden="true"
      >
        {checked && (
          <svg viewBox="0 0 10 8" className="h-2.5 w-2.5" aria-hidden="true">
            <path
              d="M1 4l3 3 5-5"
              stroke="white"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {label}
    </label>
  )
}

interface ResultsViewProps {
  result: ScanResult
  onReset: () => void
  t: (key: string) => string
}

function ResultsView({ result, onReset, t }: ResultsViewProps) {
  return (
    <div className="animate-fade-in space-y-5">
      {/* Score Hero */}
      <div
        className={`rounded-2xl border p-8 text-center ${scoreBorderBg(result.visibilityScore)}`}
      >
        <output
          aria-live="polite"
          className={`block text-7xl font-black tabular-nums leading-none ${scoreTextColor(result.visibilityScore)}`}
        >
          {result.visibilityScore}
        </output>
        <div className="mt-2 text-lg font-semibold text-slate-200">{t('scan.score.label')}</div>
        <div className="mt-0.5 text-sm text-slate-400">
          {t('scan.score.subtitle')} · {result.brand}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label={t('scan.results.mentionRate')}
          value={`${Math.round(result.coverage.mentionRate * 100)}%`}
        />
        <StatCard
          label={t('scan.results.citationRate')}
          value={`${Math.round(result.coverage.citationRate * 100)}%`}
        />
        <StatCard
          label={t('scan.results.engines')}
          value={result.engines.join(', ')}
        />
        <StatCard
          label={t('scan.results.prompts')}
          value={String(result.coverage.totalPrompts)}
        />
      </div>

      {/* Coverage Gaps */}
      {result.gaps.length > 0 && (
        <section
          aria-labelledby="gaps-heading"
          className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"
        >
          <h2
            id="gaps-heading"
            className="mb-3 flex items-center gap-2 font-semibold text-slate-200"
          >
            {t('scan.results.gaps')}
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-normal text-red-400">
              {result.gaps.length}
            </span>
          </h2>
          <ul className="space-y-1.5" role="list">
            {result.gaps.map((gap, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                <span className="mt-0.5 shrink-0 text-red-400" aria-hidden="true">
                  ●
                </span>
                {gap}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <section
          aria-labelledby="recs-heading"
          className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"
        >
          <h2 id="recs-heading" className="mb-3 font-semibold text-slate-200">
            {t('scan.results.recommendations')}
          </h2>
          <ul className="space-y-3" role="list">
            {result.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 shrink-0 text-base leading-snug" aria-hidden="true">
                  {SEVERITY_ICON[rec.severity]}
                </span>
                <span className={SEVERITY_COLOR[rec.severity]}>{rec.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Scan Again */}
      <button
        onClick={onReset}
        className="w-full rounded-xl border border-slate-700 px-6 py-3 font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
      >
        {t('scan.results.scanAgain')}
      </button>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-center">
      <div className="truncate text-lg font-bold text-white">{value}</div>
      <div className="mt-0.5 text-xs text-slate-400">{label}</div>
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

interface LanguageSelectorProps {
  locale: Locale
  onChange: (l: Locale) => void
}

function LanguageSelector({ locale, onChange }: LanguageSelectorProps) {
  return (
    <div className="relative shrink-0">
      <label htmlFor="lang-select" className="sr-only">
        Select language
      </label>
      <select
        id="lang-select"
        value={locale}
        onChange={(e) => onChange(e.target.value as Locale)}
        className={[
          'appearance-none rounded-lg border border-slate-700 bg-slate-800',
          'py-1.5 pl-3 pr-7 text-sm text-slate-300 transition',
          'hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-[#5c68f5]',
        ].join(' ')}
      >
        {(Object.entries(LOCALE_LABELS) as [Locale, string][]).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
      <span
        className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-400"
        aria-hidden="true"
      >
        ▾
      </span>
    </div>
  )
}
