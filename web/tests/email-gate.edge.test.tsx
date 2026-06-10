/**
 * EmailGate — edge-case tests
 *
 * (1) API 503 / timeout   → shows server error state (role=alert)
 * (2) Invalid email format → inline validation error + aria-invalid
 * (3) Second scan after lead capture → gate does NOT reopen
 *
 * Run: cd web && npm install && npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { EmailGate } from '@/components/EmailGate'

// ─── Harness for test 3 ──────────────────────────────────────────────────────
// Mirrors the leadCaptured guard in page.tsx:
//   if (!leadCaptured) setEmailGateOpen(true)
function ScanHarness() {
  const [open, setOpen] = useState(false)
  const [captured, setCaptured] = useState(false)

  function triggerScan() {
    if (!captured) setOpen(true)
  }

  return (
    <>
      <button onClick={triggerScan}>Scan</button>
      {open && (
        <EmailGate
          domain="test.com"
          score={50}
          variant="a"
          onClose={() => setOpen(false)}
          onSuccess={() => {
            setCaptured(true)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EmailGate — edge cases', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows server error state when API returns 503', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: 'Service unavailable' }),
      }),
    )

    render(
      <EmailGate
        domain="acme.com"
        score={42}
        variant="a"
        onClose={vi.fn()}
      />,
    )

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email address'), 'user@example.com')
    await user.click(
      screen.getByRole('button', { name: /send me the full report/i }),
    )

    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument(),
    )
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
  })

  it('shows inline validation error for invalid email format', async () => {
    render(
      <EmailGate
        domain="acme.com"
        score={42}
        variant="a"
        onClose={vi.fn()}
      />,
    )

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email address'), 'notanemail')
    await user.click(
      screen.getByRole('button', { name: /send me the full report/i }),
    )

    expect(
      await screen.findByText('Please enter a valid email address.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('does not reopen the gate on a second scan after lead is captured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    )

    render(<ScanHarness />)
    const user = userEvent.setup()

    // First scan — gate opens
    await user.click(screen.getByRole('button', { name: /scan/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Submit valid email → onSuccess fires → captured=true, gate unmounts
    await user.type(screen.getByLabelText('Email address'), 'user@example.com')
    await user.click(
      screen.getByRole('button', { name: /send me the full report/i }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )

    // Second scan — gate must NOT reopen (leadCaptured guard)
    await user.click(screen.getByRole('button', { name: /scan/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
