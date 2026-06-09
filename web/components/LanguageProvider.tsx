'use client'

/**
 * LanguageProvider — client component
 *
 * Syncs `<html lang>` and `<html dir>` with the active locale.
 * Runs in a useEffect so layout.tsx can stay a pure Server Component
 * (keeping streaming + RSC semantics intact).
 *
 * Usage: render <LanguageProvider locale={locale} /> at the top of any
 * client page that owns locale state.
 */

import { useEffect } from 'react'
import type { Locale } from '@/lib/i18n'
import { RTL_LOCALES } from '@/lib/i18n'

interface LanguageProviderProps {
  locale: Locale
}

export function LanguageProvider({ locale }: LanguageProviderProps) {
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr'
  }, [locale])

  return null
}
