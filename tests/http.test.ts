import { describe, it, expect, vi } from "vitest";
import { withRetry, fetchWithTimeout, HttpTimeoutError } from "../src/providers/http";

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

describe("fetchWithTimeout", () => {
  const init: RequestInit = { method: "GET" };

  it("resolves with the Response when the fetch resolves quickly", async () => {
    const response = new Response("ok");
    const fetchFn = vi.fn(async () => response) as unknown as typeof globalThis.fetch;
    const res = await fetchWithTimeout(fetchFn, "https://example.test", init, 1000);
    expect(res).toBe(response);
  });

  it("throws HttpTimeoutError when the fetch hangs but honors the abort signal", async () => {
    const fetchFn = ((_url: string, requestInit: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        requestInit.signal!.addEventListener("abort", () =>
          rej(new DOMException("Aborted", "AbortError")),
        );
      })) as unknown as typeof globalThis.fetch;
    await expect(
      fetchWithTimeout(fetchFn, "https://example.test", init, 10),
    ).rejects.toBeInstanceOf(HttpTimeoutError);
  });

  it("does not drive an abort when timeoutMs is 0 (disabled) and resolves normally", async () => {
    const response = new Response("ok");
    const fetchFn = vi.fn(async (_url: string, requestInit?: RequestInit) => {
      // Disabled path: no abort signal is injected into the request init.
      expect(requestInit?.signal).toBeUndefined();
      return response;
    }) as unknown as typeof globalThis.fetch;
    const res = await fetchWithTimeout(fetchFn, "https://example.test", init, 0);
    expect(res).toBe(response);
  });
});
