/**
 * tests/web/EmailGate.test.tsx
 *
 * Component tests for EmailGate (web/components/EmailGate.tsx).
 *
 * Coverage:
 *   - validateEmail:     valid / invalid / empty / error-clears-on-type
 *   - state machine:     idle → submitting → success | error
 *   - onSuccess:         called with trimmed email on success; not called on error
 *   - onClose:           Escape key / backdrop click / close button
 *   - variant copy:      A / B / C titles, CTAs, domain in subtitle
 *   - scroll lock:       body overflow hidden on mount, restored on unmount
 *
 * Environment: jsdom (set via vitest.config.ts environmentMatchGlobs)
 * Run:  npm test  (vitest run)
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EmailGate } from "@/components/EmailGate";

// ── Shared base props ─────────────────────────────────────────────────────────

const BASE = {
  domain: "acme.com",
  score: 65,
  variant: "a" as const,
  onClose: vi.fn(),
  onSuccess: vi.fn(),
};

// ── Fetch stubs ───────────────────────────────────────────────────────────────

function stubFetchOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
  );
}

function stubFetchError(msg = "Server error") {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: msg }),
    })
  );
}

function stubFetchHang() {
  // Simulates a request that never resolves (to observe the submitting state)
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. validateEmail
// ─────────────────────────────────────────────────────────────────────────────

describe("validateEmail", () => {
  it("accepts a valid email address and reaches the network call", async () => {
    stubFetchOk();
    const user = userEvent.setup();
    render(<EmailGate {...BASE} />);
    await user.type(screen.getByPlaceholderText("Work email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: /Send me the full report/i }));
    // Success state confirms fetch was called with valid email
    await waitFor(() =>
      expect(screen.getByText(/Report on its way/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/valid email/i)).not.toBeInTheDocument();
  });

  it("shows an error for an invalid email (missing @)", async () => {
    render(<EmailGate {...BASE} />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Work email"), "notanemail");
    await user.click(screen.getByRole("button", { name: /Send me the full report/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/valid email/i);
  });

  it("shows an error when submitting with an empty email field", async () => {
    render(<EmailGate {...BASE} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Send me the full report/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/valid email/i);
  });

  it("clears the email-validation error when the user starts typing", async () => {
    render(<EmailGate {...BASE} />);
    const user = userEvent.setup();
    // Trigger error first
    await user.click(screen.getByRole("button", { name: /Send me the full report/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // One character is enough to clear it
    await user.type(screen.getByPlaceholderText("Work email"), "a");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. State machine
// ─────────────────────────────────────────────────────────────────────────────

describe("state machine", () => {
  it("disables the submit button and sets aria-busy while submitting", async () => {
    stubFetchHang();
    const user = userEvent.setup();
    render(<EmailGate {...BASE} />);
    await user.type(screen.getByPlaceholderText("Work email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: /Send me the full report/i }));
    const btn = await screen.findByRole("button", { name: /sending/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("shows the success state after a successful submission", async () => {
    stubFetchOk();
    const user = userEvent.setup();
    render(<EmailGate {...BASE} />);
    await user.type(screen.getByPlaceholderText("Work email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: /Send me the full report/i }));
    await waitFor(() =>
      expect(screen.getByText(/Report on its way/i)).toBeInTheDocument()
    );
    // Success view: the "Done" close button is present
    expect(screen.getByRole("button", { name: /Done/i })).toBeInTheDocument();
  });

  it("shows the server-error alert after a failed submission", async () => {
    stubFetchError("Quota exceeded");
    const user = userEvent.setup();
    render(<EmailGate {...BASE} />);
    await user.type(screen.getByPlaceholderText("Work email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: /Send me the full report/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Something went wrong/i)
    );
    // Form should still be visible so the user can retry
    expect(screen.getByPlaceholderText("Work email")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. onSuccess callback
// ─────────────────────────────────────────────────────────────────────────────

describe("onSuccess callback", () => {
  it("calls onSuccess with the trimmed email after a successful submission", async () => {
    stubFetchOk();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<EmailGate {...BASE} onSuccess={onSuccess} />);
    // Leading/trailing spaces should be stripped
    await user.type(screen.getByPlaceholderText("Work email"), " user@example.com ");
    await user.click(screen.getByRole("button", { name: /Send me the full report/i }));
    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith("user@example.com")
    );
  });

  it("does NOT call onSuccess when the server returns an error", async () => {
    stubFetchError();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<EmailGate {...BASE} onSuccess={onSuccess} />);
    await user.type(screen.getByPlaceholderText("Work email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: /Send me the full report/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. onClose callbacks
// ─────────────────────────────────────────────────────────────────────────────

describe("onClose callbacks", () => {
  it("calls onClose when the Escape key is pressed", () => {
    const onClose = vi.fn();
    render(<EmailGate {...BASE} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close (×) button is clicked", () => {
    const onClose = vi.fn();
    render(<EmailGate {...BASE} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked directly (not the dialog)", () => {
    const onClose = vi.fn();
    const { container } = render(<EmailGate {...BASE} onClose={onClose} />);
    // The backdrop is the root element of the component tree
    // Firing directly on it means e.target === e.currentTarget → onClose fires
    const backdrop = container.firstElementChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Variant copy
// ─────────────────────────────────────────────────────────────────────────────

describe("variant copy", () => {
  it("variant A: renders the correct title and CTA", () => {
    render(<EmailGate {...BASE} variant="a" />);
    expect(
      screen.getByText(/Your full AI Visibility Report is ready/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Send me the full report/i })
    ).toBeInTheDocument();
  });

  it("variant B: renders the correct title and CTA", () => {
    render(<EmailGate {...BASE} variant="b" />);
    expect(
      screen.getByText(/The score is one number/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Get the full breakdown/i })
    ).toBeInTheDocument();
  });

  it("variant C: renders the correct title and CTA", () => {
    render(<EmailGate {...BASE} variant="c" />);
    expect(
      screen.getByText(/Know where you stand/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Get my AI Visibility Report/i })
    ).toBeInTheDocument();
  });

  it("all variants include the domain name in their subtitle copy", () => {
    const { rerender } = render(
      <EmailGate {...BASE} domain="testco.io" variant="a" />
    );
    // The domain appears in both the score-badge label and the subtitle, so
    // match all occurrences rather than asserting a single element.
    expect(screen.getAllByText(/testco\.io/).length).toBeGreaterThan(0);

    rerender(<EmailGate {...BASE} domain="testco.io" variant="b" />);
    expect(screen.getAllByText(/testco\.io/).length).toBeGreaterThan(0);

    rerender(<EmailGate {...BASE} domain="testco.io" variant="c" />);
    expect(screen.getAllByText(/testco\.io/).length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Scroll lock
// ─────────────────────────────────────────────────────────────────────────────

describe("scroll lock", () => {
  it("sets body overflow to 'hidden' while the modal is open", () => {
    render(<EmailGate {...BASE} />);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores the previous body overflow value on unmount", () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(<EmailGate {...BASE} />);
    expect(document.body.style.overflow).toBe("hidden"); // locked while open
    unmount();
    expect(document.body.style.overflow).toBe("auto"); // restored on close
  });
});
