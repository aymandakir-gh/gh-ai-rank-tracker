import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { TrendChart } from '@/components/TrendChart'
import type { WebTrendPoint } from '@/lib/types'

afterEach(cleanup)

const labels = {
  visibilityLabel: 'Visibility',
  sovLabel: 'Share of voice',
  emptyLabel: 'Run again over time to build a trend.',
  caption: 'Share of voice over time',
}

const three: WebTrendPoint[] = [
  { date: '2026-05-04T09:00:00.000Z', visibility: 30, shareOfVoice: 25 },
  { date: '2026-05-11T09:00:00.000Z', visibility: 50, shareOfVoice: 40 },
  { date: '2026-05-18T09:00:00.000Z', visibility: 72, shareOfVoice: 55 },
]

describe('TrendChart', () => {
  it('draws two series polylines for a multi-point trend', () => {
    const { container } = render(<TrendChart points={three} {...labels} />)
    const polylines = container.querySelectorAll('polyline')
    expect(polylines).toHaveLength(2) // visibility + share-of-voice
    // Circles: 2 series × 3 points.
    expect(container.querySelectorAll('circle')).toHaveLength(6)
  })

  it('renders an accessible <table> fallback with one row per point', () => {
    render(<TrendChart points={three} {...labels} />)
    const table = screen.getByRole('table', { hidden: true })
    const rows = within(table).getAllByRole('row', { hidden: true })
    // 1 header row + 3 data rows
    expect(rows).toHaveLength(4)
    expect(within(table).getByText('72', { selector: 'td' })).toBeInTheDocument()
  })

  it('exposes the chart via role="img" with the caption as its label', () => {
    render(<TrendChart points={three} {...labels} />)
    expect(screen.getByRole('img', { name: /share of voice over time/i })).toBeInTheDocument()
  })

  it('single point: shows the build-a-trend note and no connecting polylines', () => {
    const { container } = render(<TrendChart points={[three[0]!]} {...labels} />)
    expect(container.querySelectorAll('polyline')).toHaveLength(0)
    expect(container.querySelectorAll('circle')).toHaveLength(2) // still plots the dots
    expect(screen.getByText(/build a trend/i)).toBeInTheDocument()
  })

  it('empty: renders only the empty-state note', () => {
    const { container } = render(<TrendChart points={[]} {...labels} />)
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByRole('note')).toHaveTextContent(/build a trend/i)
  })
})
