import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../src/providers/http";

/** Error carrying an HTTP status, like the provider error classes. */
class StatusError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const FAST = { maxRetries: 3, baseDelayMs: 0 };

describe("withRetry", () => {
  it("returns the value on first success without retrying", async () => {
    const attempt = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(attempt, FAST)).resolves.toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("retries transient (non-4xx) failures and resolves once one succeeds", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new StatusError("boom", 500))
      .mockResolvedValueOnce("ok");
    await expect(withRetry(attempt, FAST)).resolves.toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("retries plain network errors (no status field)", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce("ok");
    await expect(withRetry(attempt, FAST)).resolves.toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a 4xx and re-throws it immediately", async () => {
    const err = new StatusError("bad request", 400);
    const attempt = vi.fn().mockRejectedValue(err);
    await expect(withRetry(attempt, FAST)).rejects.toBe(err);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("throws the last error after exhausting maxRetries on a persistent 500", async () => {
    const attempt = vi.fn().mockRejectedValue(new StatusError("down", 503));
    await expect(withRetry(attempt, { maxRetries: 2, baseDelayMs: 0 })).rejects.toBeInstanceOf(
      StatusError,
    );
    // 1 initial attempt + 2 retries
    expect(attempt).toHaveBeenCalledTimes(3);
  });
});
