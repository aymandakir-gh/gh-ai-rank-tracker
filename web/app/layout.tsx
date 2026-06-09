import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Rank Tracker — GEO/AEO Visibility Scanner',
  description:
    'See if AI answer engines like Perplexity mention and cite your brand. Get your AI Visibility Score in seconds. Free, open-source GEO/AEO diagnostic.',
  keywords: [
    'AI visibility score',
    'GEO',
    'generative engine optimization',
    'AEO',
    'answer engine optimization',
    'AI search ranking',
    'brand monitoring AI',
    'Perplexity brand tracking',
    'measure AI visibility',
    'share of voice AI',
  ],
  authors: [{ url: 'https://growthackers.io' }],
  openGraph: {
    title: 'AI Rank Tracker — GEO/AEO Visibility Scanner',
    description:
      'Does AI know your brand? Run a free scan and get your AI Visibility Score across answer engines.',
    type: 'website',
    siteName: 'AI Rank Tracker',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Rank Tracker',
    description:
      'Does AI know your brand? Get your AI Visibility Score in seconds. Free & open-source.',
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  )
}
