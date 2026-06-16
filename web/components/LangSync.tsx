"use client";

/**
 * LangSync — zero-render client component that keeps <html lang> and <html dir>
 * in sync with the ?lang= URL parameter.
 *
 * Mount it once inside <body> in the root layout.
 * Reads the param on mount and re-syncs on browser back/forward (popstate).
 * No localStorage. No state. Just DOM attribute writes.
 *
 * Supported locales match lib/i18n.ts exactly (Chinese is keyed "zh", not
 * "zh-cn"): EN, AR (RTL), IT, NL, ZH, ES, FR, DE, PT-BR. See issue #4.
 */

import { useEffect } from "react";
import { RTL_LOCALES, type Locale } from "@/lib/i18n";

const SUPPORTED: ReadonlySet<string> = new Set<string>([
  "en", "ar", "it", "nl", "zh", "es", "fr", "de", "pt-br",
]);

function applyLangFromUrl(): void {
  const lang = new URLSearchParams(window.location.search).get("lang");
  if (lang && SUPPORTED.has(lang)) {
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL_LOCALES.includes(lang as Locale)
      ? "rtl"
      : "ltr";
  }
}

export default function LangSync(): null {
  useEffect(() => {
    applyLangFromUrl();
    window.addEventListener("popstate", applyLangFromUrl);
    return () => window.removeEventListener("popstate", applyLangFromUrl);
  }, []);

  return null;
}
