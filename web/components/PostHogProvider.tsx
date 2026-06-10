'use client';

/**
 * PostHog analytics provider.
 *
 * Graceful degrade: no-op when NEXT_PUBLIC_POSTHOG_KEY is absent.
 * persistence: 'memory' — project rule prohibits localStorage/sessionStorage.
 */

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect, type ReactNode } from 'react';

interface PostHogProviderProps {
  children: ReactNode;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return; // graceful degrade — no-op when env var absent
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
      capture_pageview: true,
      capture_pageleave: true,
      persistence: 'memory', // no localStorage per project constraint
    });
  }, []);
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
