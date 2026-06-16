/**
 * W6·QA — OBS-2 runtime tests for PostHogProvider graceful degrade
 *
 * Verifies runtime behaviour (not just source inspection):
 *  1. No crash when NEXT_PUBLIC_POSTHOG_KEY is absent
 *  2. posthog.init() is NOT called when key is absent
 *  3. Children render correctly regardless of key presence
 *  4. posthog.init() IS called when key is present (happy path)
 *  5. persistence: 'memory' is enforced — no localStorage write
 */
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock posthog-js BEFORE importing the component ───────────────────────────
// posthog-js has side-effects on import; mock the entire module.
const mockInit = vi.fn()
const mockCapture = vi.fn()

vi.mock('posthog-js', () => ({
  default: {
    init: mockInit,
    capture: mockCapture,
  },
}))

vi.mock('posthog-js/react', () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="ph-provider">{children}</div>
  ),
}))

// Import AFTER mocks are set up
import { PostHogProvider } from '../components/PostHogProvider'

// ── Helpers ───────────────────────────────────────────────────────────────────

function setEnv(key: string | undefined) {
  if (key === undefined) {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY
  } else {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = key
  }
}

beforeEach(() => {
  mockInit.mockClear()
  mockCapture.mockClear()
  localStorage.clear()
})

afterEach(() => {
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PostHogProvider — graceful degrade (no key)', () => {
  it('does not throw when NEXT_PUBLIC_POSTHOG_KEY is absent', async () => {
    setEnv(undefined)
    expect(() =>
      render(
        <PostHogProvider>
          <span>child</span>
        </PostHogProvider>,
      ),
    ).not.toThrow()
  })

  it('renders children when key is absent', async () => {
    setEnv(undefined)
    await act(async () => {
      render(
        <PostHogProvider>
          <span data-testid="child">hello</span>
        </PostHogProvider>,
      )
    })
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('does NOT call posthog.init() when key is absent', async () => {
    setEnv(undefined)
    await act(async () => {
      render(
        <PostHogProvider>
          <span>child</span>
        </PostHogProvider>,
      )
    })
    expect(mockInit).not.toHaveBeenCalled()
  })

  it('does not write to localStorage when key is absent', async () => {
    setEnv(undefined)
    const setSpy = vi.spyOn(Storage.prototype, 'setItem')
    await act(async () => {
      render(
        <PostHogProvider>
          <span>child</span>
        </PostHogProvider>,
      )
    })
    expect(setSpy).not.toHaveBeenCalled()
    setSpy.mockRestore()
  })
})

describe('PostHogProvider — happy path (key present)', () => {
  it('calls posthog.init() with the provided key', async () => {
    setEnv('phc_testkey123')
    await act(async () => {
      render(
        <PostHogProvider>
          <span>child</span>
        </PostHogProvider>,
      )
    })
    expect(mockInit).toHaveBeenCalledOnce()
    expect(mockInit).toHaveBeenCalledWith(
      'phc_testkey123',
      expect.objectContaining({
        persistence: 'memory',
        capture_pageview: true,
      }),
    )
  })

  it('renders children when key is present', async () => {
    setEnv('phc_testkey123')
    await act(async () => {
      render(
        <PostHogProvider>
          <span data-testid="child">hello</span>
        </PostHogProvider>,
      )
    })
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('enforces persistence: "memory" — no localStorage write', async () => {
    setEnv('phc_testkey123')
    // posthog.init() is mocked so it won't actually write to localStorage;
    // this test verifies the config passed to init() declares memory persistence.
    await act(async () => {
      render(
        <PostHogProvider>
          <span>child</span>
        </PostHogProvider>,
      )
    })
    const initCall = mockInit.mock.calls[0]
    expect(initCall[1]).toMatchObject({ persistence: 'memory' })
  })
})
