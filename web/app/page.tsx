'use client';

/**
 * M3 Home Page — brand/prompt/competitor scan form.
 *
 * Design constraints:
 *  - No localStorage anywhere
 *  - Result passed to /results via ?r=<base64-json> URL param
 *  - Demo mode: uses server-side demoProviders(), no API keys needed
 */

import { useState, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';
import type { WebScanRequest, WebPromptSpec, WebCompetitor, ScanApiResponse } from '@/lib/types';

// ─── Default prompts ──────────────────────────────────────────────────────────

const DEFAULT_PROMPTS: WebPromptSpec[] = [
  { text: 'best performance marketing agencies in Italy', weight: 1 },
  { text: 'top digital advertising agencies for e-commerce', weight: 1 },
  { text: 'growth marketing consultants Europe', weight: 1 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Unicode-safe JSON → base64 encoding via TextEncoder. */
function encodeResult(value: object): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();

  // Brand
  const [brandName, setBrandName] = useState('');
  const [brandDomain, setBrandDomain] = useState('');
  const [brandAliases, setBrandAliases] = useState('');

  // Prompts
  const [prompts, setPrompts] = useState<WebPromptSpec[]>(DEFAULT_PROMPTS);
  const [newPromptText, setNewPromptText] = useState('');

  // Competitors
  const [competitors, setCompetitors] = useState<WebCompetitor[]>([]);
  const [newCompName, setNewCompName] = useState('');
  const [newCompDomain, setNewCompDomain] = useState('');

  // Form
  const [useDemo, setUseDemo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Prompt handlers ──────────────────────────────────────────────────────

  const addPrompt = useCallback(() => {
    const text = newPromptText.trim();
    if (!text) return;
    setPrompts((p) => [...p, { text, weight: 1 }]);
    setNewPromptText('');
  }, [newPromptText]);

  const removePrompt = useCallback((idx: number) => {
    setPrompts((p) => p.filter((_, i) => i !== idx));
  }, []);

  const setWeight = useCallback((idx: number, w: number) => {
    setPrompts((p) =>
      p.map((x, i) => (i === idx ? { ...x, weight: Math.max(1, Math.min(5, w)) } : x)),
    );
  }, []);

  // ── Competitor handlers ──────────────────────────────────────────────────

  const addCompetitor = useCallback(() => {
    const name = newCompName.trim();
    if (!name) return;
    setCompetitors((c) => [
      ...c,
      { name, domain: newCompDomain.trim() || undefined },
    ]);
    setNewCompName('');
    setNewCompDomain('');
  }, [newCompName, newCompDomain]);

  const removeCompetitor = useCallback((idx: number) => {
    setCompetitors((c) => c.filter((_, i) => i !== idx));
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!useDemo && !brandName.trim()) {
      setError('Brand name is required');
      return;
    }
    if (prompts.length === 0) {
      setError('Add at least one prompt');
      return;
    }

    const aliases = brandAliases
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: WebScanRequest = {
      brand: {
        name: useDemo ? 'GrowthHackers' : brandName.trim(),
        domain: brandDomain.trim() || undefined,
        aliases: aliases.length > 0 ? aliases : undefined,
      },
      prompts,
      competitors: competitors.length > 0 ? competitors : undefined,
      useDemo,
    };

    posthog.capture('scan_submitted', {
      is_demo: useDemo,
      prompt_count: prompts.length,
      competitor_count: competitors.length,
    });

    setLoading(true);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data: ScanApiResponse = await res.json();

      if (!data.ok || !data.result) {
        throw new Error(data.error ?? 'Scan failed');
      }

      posthog.capture('scan_completed', {
        is_demo: useDemo,
        visibility_score: data.result.visibilityScore,
        prompt_count: prompts.length,
      });

      const token = encodeResult(data.result);
      router.push(`/results?r=${encodeURIComponent(token)}`);
    } catch (err) {
      posthog.capture('scan_error', {
        is_demo: useDemo,
        error_message: err instanceof Error ? err.message : 'unknown',
      });
      setError(err instanceof Error ? err.message : 'Scan failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-background text-foreground py-12 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-brand-400 mb-3">AI Rank Tracker</h1>
          <p className="text-gray-400 text-lg">
            See how AI systems mention your brand across ChatGPT, Perplexity, and more.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-6">

          {/* Demo toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useDemo}
              onChange={(e) => setUseDemo(e.target.checked)}
              className="w-4 h-4 accent-brand-500"
            />
            <span className="text-sm text-gray-300">
              Use demo data{' '}
              <span className="text-gray-500">(GrowthHackers sample — no API keys needed)</span>
            </span>
          </label>

          {/* Brand ──────────────────────────────────────────────────────── */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Your Brand
            </h2>

            <div className="space-y-3">
              {/* Brand name */}
              <div>
                <label
                  htmlFor="brand-name"
                  className="block text-sm text-gray-300 mb-1"
                >
                  Brand name{' '}
                  <span className="text-brand-400" aria-hidden="true">*</span>
                </label>
                <input
                  id="brand-name"
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder={useDemo ? 'GrowthHackers (demo)' : 'Acme Corp'}
                  disabled={useDemo || loading}
                  autoComplete="organization"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm
                             text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none
                             focus:ring-1 focus:ring-brand-500 disabled:opacity-40 transition-colors"
                />
              </div>

              {/* Domain */}
              <div>
                <label
                  htmlFor="brand-domain"
                  className="block text-sm text-gray-300 mb-1"
                >
                  Domain{' '}
                  <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  id="brand-domain"
                  type="text"
                  value={brandDomain}
                  onChange={(e) => setBrandDomain(e.target.value)}
                  placeholder="acme.com"
                  disabled={useDemo || loading}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm
                             text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none
                             focus:ring-1 focus:ring-brand-500 disabled:opacity-40 transition-colors"
                />
              </div>

              {/* Aliases */}
              <div>
                <label
                  htmlFor="brand-aliases"
                  className="block text-sm text-gray-300 mb-1"
                >
                  Aliases{' '}
                  <span className="text-gray-500">(comma-separated, optional)</span>
                </label>
                <input
                  id="brand-aliases"
                  type="text"
                  value={brandAliases}
                  onChange={(e) => setBrandAliases(e.target.value)}
                  placeholder="Acme, ACME Inc, acme.io"
                  disabled={useDemo || loading}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm
                             text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none
                             focus:ring-1 focus:ring-brand-500 disabled:opacity-40 transition-colors"
                />
              </div>
            </div>
          </section>

          {/* Prompts ─────────────────────────────────────────────────────── */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Prompts to Test
            </h2>

            <ul className="space-y-2" aria-label="Prompt list">
              {prompts.map((p, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-gray-200 break-all">{p.text}</span>
                  <label htmlFor={`weight-${idx}`} className="sr-only">
                    Weight for prompt {idx + 1} (1–5)
                  </label>
                  <input
                    id={`weight-${idx}`}
                    type="number"
                    min={1}
                    max={5}
                    value={p.weight}
                    onChange={(e) => setWeight(idx, Number(e.target.value))}
                    title="Weight (1–5)"
                    disabled={loading}
                    className="w-14 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs
                               text-white text-center focus:border-brand-500 focus:outline-none
                               disabled:opacity-40"
                  />
                  <button
                    type="button"
                    onClick={() => removePrompt(idx)}
                    disabled={loading || prompts.length <= 1}
                    aria-label={`Remove prompt: ${p.text}`}
                    className="shrink-0 px-1 text-sm text-gray-500 hover:text-red-400
                               disabled:opacity-30 transition-colors"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex gap-2">
              <input
                type="text"
                value={newPromptText}
                onChange={(e) => setNewPromptText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPrompt();
                  }
                }}
                placeholder="Add a prompt…"
                disabled={loading}
                aria-label="New prompt text"
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm
                           text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none
                           focus:ring-1 focus:ring-brand-500 disabled:opacity-40 transition-colors"
              />
              <button
                type="button"
                onClick={addPrompt}
                disabled={loading || !newPromptText.trim()}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm
                           text-brand-400 hover:bg-white/10 disabled:opacity-40 transition-colors"
              >
                Add
              </button>
            </div>
          </section>

          {/* Competitors ─────────────────────────────────────────────────── */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Competitors{' '}
              <span className="font-normal text-gray-500 normal-case">(optional)</span>
            </h2>

            {competitors.length > 0 && (
              <ul className="space-y-1" aria-label="Competitor list">
                {competitors.map((c, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-gray-200">
                    <span className="flex-1">
                      {c.name}
                      {c.domain && (
                        <span className="ml-1 text-gray-500">({c.domain})</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCompetitor(idx)}
                      disabled={loading}
                      aria-label={`Remove competitor: ${c.name}`}
                      className="px-1 text-sm text-gray-500 hover:text-red-400
                                 disabled:opacity-30 transition-colors"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={newCompName}
                onChange={(e) => setNewCompName(e.target.value)}
                placeholder="Competitor name"
                disabled={loading}
                aria-label="Competitor name"
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm
                           text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none
                           focus:ring-1 focus:ring-brand-500 disabled:opacity-40 transition-colors"
              />
              <input
                type="text"
                value={newCompDomain}
                onChange={(e) => setNewCompDomain(e.target.value)}
                placeholder="domain.com"
                disabled={loading}
                aria-label="Competitor domain (optional)"
                className="w-32 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm
                           text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none
                           focus:ring-1 focus:ring-brand-500 disabled:opacity-40 transition-colors"
              />
              <button
                type="button"
                onClick={addCompetitor}
                disabled={loading || !newCompName.trim()}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm
                           text-brand-400 hover:bg-white/10 disabled:opacity-40 transition-colors"
              >
                Add
              </button>
            </div>
          </section>

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700
                       disabled:opacity-60 disabled:cursor-not-allowed px-6 py-3 text-base
                       font-semibold text-white transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-4 w-4"
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
                Scanning AI systems…
              </span>
            ) : (
              'Run Scan'
            )}
          </button>

        </form>
      </div>
    </main>
  );
}
