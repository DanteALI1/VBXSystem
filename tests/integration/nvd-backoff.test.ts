import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { syncState, vulnerabilities, vulnerabilitySources } from "@/db/schema";
import {
  computeBackoffMs,
  runNvdSync,
  type NvdApiResponse,
} from "@/lib/sync/nvd";

const TEST_URL =
  process.env.DATABASE_URL_TEST ??
  "postgresql://vuln:vuln@localhost:5432/vuln_test";

function loadFixture(): NvdApiResponse {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "tests/fixtures/nvd-fragment.json"), "utf8"),
  ) as NvdApiResponse;
}

describe("TC-006 NVD rate-limit backoff (mock)", () => {
  const client = postgres(TEST_URL, { max: 5 });
  const db = drizzle(client, { schema });

  beforeEach(async () => {
    await db.delete(vulnerabilitySources);
    await db.delete(vulnerabilities);
    await db.delete(syncState);
  });

  afterAll(async () => {
    await client.end();
  });

  it("computeBackoffMs grows exponentially and honors Retry-After", () => {
    const a0 = computeBackoffMs(0, { random: () => 0 });
    const a1 = computeBackoffMs(1, { random: () => 0 });
    const a2 = computeBackoffMs(2, { random: () => 0 });
    expect(a0).toBeGreaterThanOrEqual(1_000);
    expect(a1).toBeGreaterThan(a0);
    expect(a2).toBeGreaterThan(a1);
    expect(a2).toBeLessThanOrEqual(60_000);

    expect(computeBackoffMs(0, { retryAfterSec: 3, random: () => 0 })).toBe(3_000);
  });

  it("retries on 429 then succeeds and updates SyncState", async () => {
    const fixture = loadFixture();
    const delays: number[] = [];
    let calls = 0;

    const mockFetch: typeof fetch = async () => {
      calls += 1;
      if (calls <= 2) {
        return new Response("rate limited", {
          status: 429,
          headers: { "Retry-After": "1" },
        });
      }
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await runNvdSync({
      db,
      payload: { mode: "full", cveId: "CVE-2024-0001" },
      clientOptions: {
        fetch: mockFetch,
        sleep: async (ms) => {
          delays.push(ms);
        },
        config: { apiKey: "test-key", maxRetries: 5, noKeyPauseMs: 0 },
        random: () => 0,
      },
      now: new Date("2024-04-01T00:00:00.000Z"),
    });

    expect(calls).toBe(3);
    expect(delays.length).toBeGreaterThanOrEqual(2);
    // Retry-After: 1 → 1000ms each for the two 429s
    expect(delays[0]).toBe(1_000);
    expect(delays[1]).toBe(1_000);
    expect(result.upserted).toBe(1);

    const state = await db.query.syncState.findFirst({
      where: eq(syncState.source, "nvd"),
    });
    expect(state?.lastSuccessAt).not.toBeNull();
    expect(state?.lastError).toBeNull();
  });

  it("exhausts retries without marking lastSuccessAt", async () => {
    const delays: number[] = [];
    let calls = 0;

    const mockFetch: typeof fetch = async () => {
      calls += 1;
      return new Response("still limited", {
        status: 429,
        headers: { "Retry-After": "2" },
      });
    };

    await expect(
      runNvdSync({
        db,
        payload: { mode: "full", cveId: "CVE-2024-0001" },
        clientOptions: {
          fetch: mockFetch,
          sleep: async (ms) => {
            delays.push(ms);
          },
          config: { apiKey: "test-key", maxRetries: 2, noKeyPauseMs: 0 },
          random: () => 0,
        },
        now: new Date("2024-04-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow(/rate limited/i);

    // attempts 0..2 inclusive => 3 calls; sleep between first two failures
    expect(calls).toBe(3);
    expect(delays.length).toBe(2);
    expect(delays.every((d) => d === 2_000)).toBe(true);

    const state = await db.query.syncState.findFirst({
      where: eq(syncState.source, "nvd"),
    });
    expect(state?.lastSuccessAt).toBeNull();
    expect(state?.lastError).toMatch(/rate limited/i);
    expect(state?.lastAttemptAt).not.toBeNull();

    const vulns = await db.select().from(vulnerabilities);
    expect(vulns).toHaveLength(0);
  });
});
