/**
 * W6·QA — i18n unit tests
 * Coverage: LOCALE_LABELS · RTL_LOCALES · translations completeness · t() fallback
 * Run via root vitest: npx vitest run tests/web/i18n.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  translations,
  LOCALE_LABELS,
  RTL_LOCALES,
  type Locale,
  type TranslationDict,
} from '../../web/lib/i18n'

const ALL_LOCALES: Locale[] = ['en', 'ar', 'it', 'nl', 'zh', 'es', 'fr', 'de', 'pt-br']
const EN_KEYS = Object.keys(translations.en).sort()

// Simulate the t() used in page.tsx:
// translations[locale][key] ?? translations.en[key] ?? key
function t(locale: Locale, key: string): string {
  return translations[locale][key] ?? translations.en[key] ?? key
}

// ─── LOCALE_LABELS ────────────────────────────────────────────────────────────

describe('LOCALE_LABELS', () => {
  it('contains exactly 9 locales', () => {
    expect(Object.keys(LOCALE_LABELS)).toHaveLength(9)
  })

  it('contains all expected locale codes', () => {
    for (const locale of ALL_LOCALES) {
      expect(LOCALE_LABELS, `LOCALE_LABELS missing "${locale}"`).toHaveProperty(locale)
    }
  })

  it('all labels are non-empty strings', () => {
    for (const [locale, label] of Object.entries(LOCALE_LABELS)) {
      expect(typeof label, `label for "${locale}" should be string`).toBe('string')
      expect(label.trim(), `label for "${locale}" should be non-empty`).not.toBe('')
    }
  })

  it('English label is "English"', () => {
    expect(LOCALE_LABELS.en).toBe('English')
  })

  it('Arabic label is in Arabic script', () => {
    expect(LOCALE_LABELS.ar).toBe('العربية')
  })

  it('Chinese label contains CJK characters', () => {
    expect(LOCALE_LABELS.zh).toMatch(/[一-鿿]/)
  })
})

// ─── RTL_LOCALES ──────────────────────────────────────────────────────────────

describe('RTL_LOCALES', () => {
  it('only Arabic is RTL', () => {
    expect(RTL_LOCALES).toEqual(['ar'])
  })

  it('ar is in RTL_LOCALES', () => {
    expect(RTL_LOCALES.includes('ar')).toBe(true)
  })

  it('LTR locales are not in RTL_LOCALES', () => {
    const ltrLocales: Locale[] = ['en', 'it', 'nl', 'zh', 'es', 'fr', 'de', 'pt-br']
    for (const locale of ltrLocales) {
      expect(RTL_LOCALES.includes(locale), `"${locale}" must not be RTL`).toBe(false)
    }
  })
})

// ─── TRANSLATIONS COMPLETENESS ────────────────────────────────────────────────

describe('translations completeness', () => {
  it('contains all 9 locales', () => {
    expect(Object.keys(translations)).toHaveLength(9)
    for (const locale of ALL_LOCALES) {
      expect(translations, `translations missing "${locale}"`).toHaveProperty(locale)
    }
  })

  it('every locale has the same keys as EN', () => {
    for (const locale of ALL_LOCALES) {
      const localeKeys = Object.keys(translations[locale]).sort()
      expect(
        localeKeys,
        `"${locale}" has different keys than EN`,
      ).toEqual(EN_KEYS)
    }
  })

  it('no locale has extra keys not present in EN', () => {
    for (const locale of ALL_LOCALES) {
      const extra = Object.keys(translations[locale]).filter((k) => !EN_KEYS.includes(k))
      expect(extra, `"${locale}" has extra keys: ${extra.join(', ')}`).toHaveLength(0)
    }
  })

  it('all values are non-empty strings', () => {
    for (const locale of ALL_LOCALES) {
      for (const [key, val] of Object.entries(translations[locale] as TranslationDict)) {
        expect(typeof val, `${locale}.${key} should be string`).toBe('string')
        expect(val.trim(), `${locale}.${key} should be non-empty`).not.toBe('')
      }
    }
  })

  it('EN has all required UI keys', () => {
    const required = [
      'nav.title',
      'nav.tagline',
      'scan.badge',
      'scan.hero.title',
      'scan.hero.subtitle',
      'scan.form.url.label',
      'scan.form.url.placeholder',
      'scan.form.providers.label',
      'scan.form.providers.mock',
      'scan.form.providers.perplexity',
      'scan.form.cta',
      'scan.scanning',
      'scan.scanning.desc',
      'scan.score.label',
      'scan.score.subtitle',
      'scan.results.mentionRate',
      'scan.results.citationRate',
      'scan.results.engines',
      'scan.results.prompts',
      'scan.results.gaps',
      'scan.results.recommendations',
      'scan.results.scanAgain',
      'scan.error.title',
      'scan.error.retry',
      'scan.validation.url',
      'scan.validation.provider',
    ]
    for (const key of required) {
      expect(EN_KEYS, `EN is missing required key "${key}"`).toContain(key)
    }
  })
})

// ─── t() FALLBACK SIMULATION ──────────────────────────────────────────────────

describe('t() fallback', () => {
  it('returns correct translation for known key + locale', () => {
    expect(t('en', 'nav.title')).toBe('AI Rank Tracker')
    expect(t('it', 'scan.form.cta')).toBe('Avvia scansione AI')
    expect(t('de', 'scan.error.retry')).toBe('Erneut versuchen')
  })

  it('falls back to EN when key is missing from a locale dict', () => {
    // Simulate a locale with a missing key
    const fallback =
      (undefined as string | undefined) ?? translations.en['nav.title'] ?? 'nav.title'
    expect(fallback).toBe('AI Rank Tracker')
  })

  it('falls back to key string when key is absent from both locale and EN', () => {
    expect(t('en', 'totally.nonexistent.key')).toBe('totally.nonexistent.key')
  })

  it('Arabic scan.form.cta is in Arabic script', () => {
    const cta = t('ar', 'scan.form.cta')
    expect(cta).toMatch(/[؀-ۿ]/) // Arabic Unicode range
  })

  it('Chinese nav.title contains CJK characters', () => {
    expect(t('zh', 'nav.title')).toMatch(/[一-鿿]/)
  })

  it('pt-br locale is accessible via t()', () => {
    const badge = t('pt-br', 'scan.badge')
    expect(badge).not.toBe('scan.badge') // must not fall back to key
    expect(badge.trim()).not.toBe('')
  })

  it('all locales return non-empty string for scan.validation.url', () => {
    for (const locale of ALL_LOCALES) {
      const val = t(locale, 'scan.validation.url')
      expect(val).not.toBe('scan.validation.url') // no key fallback
      expect(val.trim()).not.toBe('')
    }
  })

  it('all locales return non-empty string for scan.validation.provider', () => {
    for (const locale of ALL_LOCALES) {
      const val = t(locale, 'scan.validation.provider')
      expect(val).not.toBe('scan.validation.provider')
      expect(val.trim()).not.toBe('')
    }
  })
})
