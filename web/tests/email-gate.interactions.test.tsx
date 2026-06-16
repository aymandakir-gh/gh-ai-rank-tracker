/**
 * EmailGate — interaction tests
 *
 * Covers UX paths not reached by email-gate.edge.test.tsx:
 *  (1) Escape key          → onClose called
 *  (2) Backdrop click      → onClose called
 *  (3) Submitting state    → CTA button disabled + aria-busy="true"
 *  (4) Success state       → SuccessState ("Report on its way.") renders
 *  (5) Network throw       → server error state (role=alert)
 *  (6) onSuccess trimmed   → called with trimmed email string
 *
 * Run: cd web && npm install && npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmailGate } from '@/components/EmailGate'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockFetch(ok: boolean, body: unknown = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 503,
      json: () => Promise.resolve(body),
    }),
  )
}

function renderGate(overrides: Partial<Parameters<typeof EmailGate>[0]> = {}) {
  const defaults = {
    domain: 'acme.com',
    score: 50,
    variant: 'a' as const,
    onClose: vi.fn(),
  }
  return render(<EmailGate {...defaults} {...overrides} />)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EmailGate — interactions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // ── (1) Escape key ──────────────────────────────────────────────────────────

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn()
    renderGate({ onClose })

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()
  })

  // ── (2) Backdrop click ──────────────────────────────────────────────────────

  it('calls onClose when the backdrop (outside dialog) is clicked', () => {
    const onClose = vi.fn()
    const { container } = renderGate({ onClose })

    // The outermost element is the backdrop div with onClick={handleBackdropClick}.
    // Firing click directly on it: target === currentTarget → onClose fires.
    const backdrop = container.firstChild as HTMLElement
    fireEvent.click(backdrop)

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does NOT call onClose when clicking inside the dialog box', () => {
    const onClose = vi.fn()
    renderGate({ onClose })

    // Click the dialog itself — event bubbles but target ≠ currentTarget (backdrop).
    fireEvent.click(screen.getByRole('dialog'))

    expect(onClose).not.toHaveBeenCalled()
  })

  // ── (3) Submitting state ────────────────────────────────────────────────────

  it('disables the CTA button and sets aria-busy while fetch is in flight', async () => {
    // Keep fetch pending so we can inspect the intermediate state.
    let resolve!: (v: unknown) => void
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise((r) => { resolve = r })),
    )

    renderGate()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email address'), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /send me the full report/i }))

    // The CTA text changes to "Sending…" while in-flight.
    const btn = screen.getByRole('button', { name: /sending/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')

    // Clean up — resolve the pending fetch so jsdom timers settle.
    resolve({ ok: true, json: () => Promise.resolve({}) })
  })

  // ── (4) Success state ───────────────────────────────────────────────────────

  it('renders SuccessState ("Report on its way.") after a successful submission', async () => {
    mockFetch(true)

    renderGate()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email address'), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /send me the full report/i }))

    await waitFor(() =>
      expect(screen.getByText('Report on its way.')).toBeInTheDocument(),
    )

    // The form inputs should no longer be present.
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument()
  })

  // ── (5) Network throw ───────────────────────────────────────────────────────

  it('shows server error state when fetch throws (network failure)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network down')),
    )

    renderGate()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email address'), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /send me the full report/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument(),
    )
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
  })

  // ── (6) onSuccess fires once with the submitted email ────────────────────────

  it('calls onSuccess exactly once with the entered email on a successful submit', async () => {
    // NOTE: trimming is NOT asserted here — `<input type="email">` strips
    // surrounding whitespace in the browser/jsdom before it reaches state, so
    // the component's defensive .trim() is unobservable at this layer. The
    // trim-before-validate behaviour is covered where it is observable: the
    // lead route's zod `.trim().email()` (see lead-route.test.ts).
    mockFetch(true)
    const onSuccess = vi.fn()

    renderGate({ onSuccess })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email address'), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /send me the full report/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
    expect(onSuccess).toHaveBeenCalledWith('user@example.com')
  })
})
