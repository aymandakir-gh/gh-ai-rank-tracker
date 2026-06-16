'use client';

/**
 * Campaign Dashboard (/campaign) — tracking over time.
 *
 * Defines/runs a campaign (or loads the demo), then renders a share-of-voice
 * trend, a per-engine breakdown, a competitor comparison and a per-prompt
 * drill-down. Fully i18n'd (9 locales) via ?lang=; Tailwind-only charts.
 */

import { Suspense, useCallback, useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LanguageProvider } from '@/components/LanguageProvider';
import { TrendChart } from '@/components/TrendChart';
import {
  LOCALE_LABELS,
  isLocale,
  t as translate,
  type Locale,
} from '@/lib/i18n';
import type {
  CampaignApiResponse,
  WebCampaignResult,
  WebCompetitorEntry,
} from '@/lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function deltaLabel(n: number): string {
  return `${n >= 0 ? '+' : ''}${n}`;
}

function Bar({ label, value, barClass = 'bg-brand-500', suffix = '%' }: {
  label: string;
  value: number;
  barClass?: string;
  suffix?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(100, value)));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-300">
        <span className="truncate pr-2">{label}</span>
        <span className="tabular-nums shrink-0">{value}{suffix}</span>
      </div>
      <div
        className="h-2 rounded-full bg-white/5 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Dashboard sections ─────────────────────────────────────────────────────────

function Dashboard({ result, locale }: { result: WebCampaignResult; locale: Locale }) {
  const t = (k: string) => translate(locale, k);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const competitorsSorted = useMemo(
    () => [...result.competitors].sort((a, b) => b.shareOfVoice - a.shareOfVoice),
    [result.competitors],
  );

  return (
    <div className="space-y-6">
      {/* Score + deltas */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-wrap items-center gap-6">
        <div>
          <div className={`text-5xl font-extrabold ${scoreColor(result.visibilityScore)}`}>
            {result.visibilityScore}
            <span className="text-xl font-normal text-gray-400 ml-1">/100</span>
          </div>
          <p className="text-gray-300 text-sm mt-1">{t('campaign.score.label')}</p>
        </div>
        <div className="text-sm text-gray-400">
          <div>
            {result.runCount} {t('campaign.runs')}
          </div>
          {result.runCount > 1 && (
            <div className="mt-1">
              {t('campaign.trend.delta')}:{' '}
              <span className={result.visibilityDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {deltaLabel(result.visibilityDelta)} {t('campaign.trend.visibility')}
              </span>
              {' · '}
              <span className={result.shareOfVoiceDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {deltaLabel(result.shareOfVoiceDelta)}% {t('campaign.trend.sov')}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Trend */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6" aria-labelledby="trend-h">
        <h2 id="trend-h" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
          {t('campaign.trend.title')}
        </h2>
        <TrendChart
          points={result.trend}
          visibilityLabel={t('campaign.trend.visibility')}
          sovLabel={t('campaign.trend.sov')}
          emptyLabel={t('campaign.trend.empty')}
          caption={t('campaign.trend.title')}
        />
      </section>

      {/* Per-engine breakdown */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4" aria-labelledby="eng-h">
        <h2 id="eng-h" className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {t('campaign.engines.title')}
        </h2>
        <div className="space-y-5">
          {result.engineBreakdown.map((e) => (
            <div key={e.engine} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-gray-200">{e.engine}</span>
                <span className={`tabular-nums font-mono ${scoreColor(e.score)}`}>{e.score}/100</span>
              </div>
              <Bar label={t('campaign.engines.mentionRate')} value={e.mentionRate} barClass="bg-brand-400" />
              <Bar label={t('campaign.engines.citationRate')} value={e.citationRate} barClass="bg-emerald-500" />
            </div>
          ))}
        </div>
      </section>

      {/* Competitor comparison */}
      {competitorsSorted.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4" aria-labelledby="comp-h">
          <h2 id="comp-h" className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {t('campaign.competitors.title')}
          </h2>
          <div className="space-y-3">
            {competitorsSorted.map((c: WebCompetitorEntry) => (
              <Bar
                key={c.brand}
                label={c.isTracked ? `${c.brand} (${t('campaign.competitors.you')})` : c.brand}
                value={c.shareOfVoice}
                barClass={c.isTracked ? 'bg-brand-500' : 'bg-gray-600'}
              />
            ))}
          </div>
        </section>
      )}

      {/* Per-prompt drill-down */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-3" aria-labelledby="drill-h">
        <h2 id="drill-h" className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {t('campaign.prompts.title')}
        </h2>
        <ul className="divide-y divide-white/5">
          {result.prompts.map((p, i) => {
            const isOpen = expanded.has(i);
            return (
              <li key={i} className="py-2">
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-3 text-left text-sm hover:bg-white/5 rounded px-2 py-1.5 transition-colors"
                >
                  <span className="text-gray-500 shrink-0" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                  <span className="flex-1 text-gray-200 truncate">{p.prompt}</span>
                  <span className={`tabular-nums font-mono shrink-0 ${scoreColor(p.score)}`}>{p.score}</span>
                </button>
                {isOpen && (
                  <div className="px-7 pb-2 pt-1 text-xs text-gray-400 space-y-1">
                    <div>
                      {t('campaign.prompts.mentions')}: <span className="tabular-nums">{p.mentions}</span>
                    </div>
                    <div>
                      {t('campaign.prompts.citations')}:{' '}
                      {p.citations.length === 0 ? (
                        <span>{t('campaign.prompts.none')}</span>
                      ) : (
                        <ul className="mt-1 space-y-0.5">
                          {p.citations.map((cit, ci) => (
                            <li key={ci} className="flex gap-2">
                              <span className="text-gray-500">#{cit.rank}</span>
                              <span className="text-gray-400">{cit.engine}</span>
                              {cit.url && (
                                <a
                                  href={cit.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-brand-400 hover:text-brand-300 underline underline-offset-2 truncate"
                                >
                                  {cit.url.replace(/^https?:\/\//, '')}
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

// ─── Page content ─────────────────────────────────────────────────────────────

const DEFAULT_PROMPTS = [
  'best growth marketing agencies for B2B SaaS',
  'how to get cited by AI answer engines',
];

function CampaignContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const langParam = searchParams.get('lang');
  const locale: Locale = isLocale(langParam) ? langParam : 'en';
  const t = (k: string) => translate(locale, k);

  const [brandName, setBrandName] = useState('');
  const [brandDomain, setBrandDomain] = useState('');
  const [prompts, setPrompts] = useState<string[]>(DEFAULT_PROMPTS);
  const [newPrompt, setNewPrompt] = useState('');
  const [competitors, setCompetitors] = useState<Array<{ name: string; domain?: string }>>([]);
  const [newCompName, setNewCompName] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<WebCampaignResult | null>(null);

  const setLang = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('lang', next);
      router.replace(`/campaign?${params.toString()}`);
    },
    [router, searchParams],
  );

  const run = useCallback(async (payload: unknown) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data: CampaignApiResponse = await res.json();
      if (!data.ok || !data.result) throw new Error(data.error ?? 'Campaign run failed');
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Campaign run failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const runDemo = useCallback(() => run({ useDemo: true }), [run]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!brandName.trim()) {
      setError(t('campaign.form.brandRequired'));
      return;
    }
    if (prompts.length === 0) {
      setError(t('campaign.form.promptRequired'));
      return;
    }
    run({
      campaign: {
        name: `${brandName.trim()} — AI visibility`,
        brand: { name: brandName.trim(), domain: brandDomain.trim() || undefined },
        prompts: prompts.map((text) => ({ text, weight: 1 })),
        competitors: competitors.length ? competitors : undefined,
      },
    });
  };

  return (
    <main className="min-h-screen bg-background text-foreground py-12 px-4">
      <LanguageProvider locale={locale} />
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header + language selector */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-brand-400">{t('campaign.hero.title')}</h1>
            <p className="text-gray-400 text-sm mt-1 max-w-xl">{t('campaign.hero.subtitle')}</p>
          </div>
          <label className="text-xs text-gray-400">
            <span className="sr-only">Language</span>
            <select
              value={locale}
              onChange={(e) => setLang(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-gray-200 focus:border-brand-500 focus:outline-none"
            >
              {Object.entries(LOCALE_LABELS).map(([code, label]) => (
                <option key={code} value={code} className="bg-[#111117]">
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="c-brand" className="block text-sm text-gray-300 mb-1">{t('campaign.form.brand')}</label>
              <input
                id="c-brand"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="Acme Corp"
                disabled={loading}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none disabled:opacity-40"
              />
            </div>
            <div>
              <label htmlFor="c-domain" className="block text-sm text-gray-300 mb-1">{t('campaign.form.domain')}</label>
              <input
                id="c-domain"
                value={brandDomain}
                onChange={(e) => setBrandDomain(e.target.value)}
                placeholder="acme.com"
                disabled={loading}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none disabled:opacity-40"
              />
            </div>
          </div>

          <div>
            <span className="block text-sm text-gray-300 mb-1">{t('campaign.form.prompts')}</span>
            <ul className="space-y-1 mb-2" aria-label={t('campaign.form.prompts')}>
              {prompts.map((p, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-gray-200">
                  <span className="flex-1 break-all">{p}</span>
                  <button
                    type="button"
                    onClick={() => setPrompts((prev) => prev.filter((_, j) => j !== i))}
                    disabled={loading}
                    aria-label={`Remove prompt: ${p}`}
                    className="px-1 text-gray-400 hover:text-red-400 disabled:opacity-30"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newPrompt.trim()) {
                      setPrompts((p) => [...p, newPrompt.trim()]);
                      setNewPrompt('');
                    }
                  }
                }}
                placeholder={t('campaign.form.promptPlaceholder')}
                disabled={loading}
                aria-label={t('campaign.form.promptPlaceholder')}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none disabled:opacity-40"
              />
              <button
                type="button"
                onClick={() => {
                  if (newPrompt.trim()) {
                    setPrompts((p) => [...p, newPrompt.trim()]);
                    setNewPrompt('');
                  }
                }}
                disabled={loading || !newPrompt.trim()}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-brand-400 hover:bg-white/10 disabled:opacity-40"
              >
                {t('campaign.form.add')}
              </button>
            </div>
          </div>

          <div>
            <span className="block text-sm text-gray-300 mb-1">{t('campaign.form.competitors')}</span>
            {competitors.length > 0 && (
              <ul className="space-y-1 mb-2" aria-label={t('campaign.form.competitors')}>
                {competitors.map((c, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-gray-200">
                    <span className="flex-1">{c.name}</span>
                    <button
                      type="button"
                      onClick={() => setCompetitors((prev) => prev.filter((_, j) => j !== i))}
                      disabled={loading}
                      aria-label={`Remove competitor: ${c.name}`}
                      className="px-1 text-gray-400 hover:text-red-400 disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <input
                value={newCompName}
                onChange={(e) => setNewCompName(e.target.value)}
                placeholder={t('campaign.form.competitorName')}
                disabled={loading}
                aria-label={t('campaign.form.competitorName')}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none disabled:opacity-40"
              />
              <button
                type="button"
                onClick={() => {
                  if (newCompName.trim()) {
                    setCompetitors((c) => [...c, { name: newCompName.trim() }]);
                    setNewCompName('');
                  }
                }}
                disabled={loading || !newCompName.trim()}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-brand-400 hover:bg-white/10 disabled:opacity-40"
              >
                {t('campaign.form.add')}
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-60 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
            >
              {loading ? t('campaign.form.running') : t('campaign.form.run')}
            </button>
            <button
              type="button"
              onClick={runDemo}
              disabled={loading}
              className="rounded-xl border border-white/10 px-5 py-2.5 text-sm font-semibold text-gray-200 hover:bg-white/5 disabled:opacity-40 transition-colors"
            >
              {t('campaign.form.demo')}
            </button>
            <a
              href="/"
              className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-gray-400 hover:bg-white/5 transition-colors"
            >
              {t('campaign.back')}
            </a>
          </div>
        </form>

        {/* Loading */}
        {loading && (
          <div className="text-center text-gray-400" role="status" aria-live="polite">
            {t('campaign.form.running')}
          </div>
        )}

        {/* Results */}
        {result && !loading && <Dashboard result={result} locale={locale} />}
      </div>
    </main>
  );
}

export default function CampaignPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" aria-busy="true" />}>
      <CampaignContent />
    </Suspense>
  );
}
