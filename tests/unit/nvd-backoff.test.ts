import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NvdClient } from "@/lib/nvd/client";

describe("NvdClient rate-limit backoff (TC-006)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries after 429 Retry-After then returns 200", async () => {
    const sleeps: number[] = [];
    const sleepFn = vi.fn(async (ms: number) => {
      sleeps.push(ms);
      // Advance fake timers so the await completes
      await vi.advanceTimersByTimeAsync(ms);
    });

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "Retry-After": "2" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            resultsPerPage: 1,
            startIndex: 0,
            totalResults: 1,
            vulnerabilities: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const client = new NvdClient({
      apiKey: "test-key",
      fetchFn: fetchFn as unknown as typeof fetch,
      sleepFn,
      maxRetries: 3,
    });

    const pagePromise = client.fetchPage({ startIndex: 0 });
    const page = await pagePromise;

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([2000]);
    expect(page.totalResults).toBe(1);
  });

  it("stops after maxRetries on persistent 429", async () => {
    const sleepFn = vi.fn(async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
    });

    const fetchFn = vi.fn().mockResolvedValue(
      new Response("rate limited", {
        status: 429,
        headers: { "Retry-After": "1" },
      }),
    );

    const client = new NvdClient({
      apiKey: "test-key",
      fetchFn: fetchFn as unknown as typeof fetch,
      sleepFn,
      maxRetries: 2,
    });

    await expect(client.fetchPage()).rejects.toThrow(/rate limited/i);
    // initial + 2 retries = 3 attempts
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("pauses between requests when no API key", async () => {
    const sleeps: number[] = [];
    const sleepFn = vi.fn(async (ms: number) => {
      sleeps.push(ms);
      await vi.advanceTimersByTimeAsync(ms);
    });

    const ok = () =>
      new Response(
        JSON.stringify({
          resultsPerPage: 0,
          startIndex: 0,
          totalResults: 0,
          vulnerabilities: [],
        }),
        { status: 200 },
      );

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok());

    const client = new NvdClient({
      apiKey: null,
      fetchFn: fetchFn as unknown as typeof fetch,
      sleepFn,
      noKeyPauseMs: 6000,
    });

    await client.fetchPage();
    // Simulate little elapsed time before second request
    await vi.advanceTimersByTimeAsync(100);
    await client.fetchPage();

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleeps.some((ms) => ms > 5000)).toBe(true);
  });
});
