import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/db/schema";
import {
  syncState,
  vulnerabilities,
  vulnerabilityHistory,
  vulnerabilitySources,
} from "@/db/schema";
import { runNvdSync, type NvdApiResponse } from "@/lib/sync/nvd";

const TEST_URL =
  process.env.DATABASE_URL_TEST ??
  "postgresql://vuln:vuln@localhost:5432/vuln_test";

function loadFixture(): NvdApiResponse {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "tests/fixtures/nvd-fragment.json"), "utf8"),
  ) as NvdApiResponse;
}

describe("TC-005 NVD upsert idempotent", () => {
  const client = postgres(TEST_URL, { max: 5 });
  const db = drizzle(client, { schema });

  beforeAll(async () => {
    // ensure schema present
    await db.select().from(syncState).limit(1);
  });

  beforeEach(async () => {
    await db.delete(vulnerabilityHistory);
    await db.delete(vulnerabilitySources);
    await db.delete(vulnerabilities);
    await db.delete(syncState);
  });

  afterAll(async () => {
    await client.end();
  });

  it("upserts once, stays idempotent on repeat, writes history on field change", async () => {
    const fixture = loadFixture();
    const delays: number[] = [];

    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const sleep = async (ms: number) => {
      delays.push(ms);
    };

    const first = await runNvdSync({
      db,
      payload: { mode: "full", cveId: "CVE-2024-0001" },
      clientOptions: {
        fetch: mockFetch,
        sleep,
        config: { apiKey: "test-key", maxRetries: 2, noKeyPauseMs: 0 },
        random: () => 0,
      },
      now: new Date("2024-03-01T00:00:00.000Z"),
    });

    expect(first.upserted).toBe(1);

    const vulns1 = await db.select().from(vulnerabilities);
    const sources1 = await db.select().from(vulnerabilitySources);
    expect(vulns1).toHaveLength(1);
    expect(sources1).toHaveLength(1);
    expect(vulns1[0].cveId).toBe("CVE-2024-0001");
    expect(vulns1[0].severity).toBe("critical");
    expect(Number(vulns1[0].cvssScore)).toBe(9.8);
    expect(vulns1[0].kev).toBe(true);
    expect(vulns1[0].localSyncedAt).not.toBeNull();
    expect(vulns1[0].vendors).toContain("examplecorp");
    expect(vulns1[0].products).toContain("widget");
    expect(sources1[0].source).toBe("nvd");

    const state1 = await db.query.syncState.findFirst({
      where: eq(syncState.source, "nvd"),
    });
    expect(state1?.lastSuccessAt).not.toBeNull();
    expect(state1?.lastError).toBeNull();

    // Second run — identical fixture → no duplicate rows
    const second = await runNvdSync({
      db,
      payload: { mode: "full", cveId: "CVE-2024-0001" },
      clientOptions: {
        fetch: mockFetch,
        sleep,
        config: { apiKey: "test-key", maxRetries: 2, noKeyPauseMs: 0 },
        random: () => 0,
      },
      now: new Date("2024-03-01T01:00:00.000Z"),
    });

    expect(second.upserted + second.unchanged).toBe(1);
    const vulns2 = await db.select().from(vulnerabilities);
    const sources2 = await db.select().from(vulnerabilitySources);
    expect(vulns2).toHaveLength(1);
    expect(sources2).toHaveLength(1);
    expect(vulns2[0].id).toBe(vulns1[0].id);

    // Third run — mutate description + CVSS in fixture
    const mutated: NvdApiResponse = structuredClone(fixture);
    const cve =
      mutated.vulnerabilities?.[0]?.cve ?? mutated.results?.[0]?.cve;
    expect(cve).toBeDefined();
    if (!cve) throw new Error("missing cve in fixture");
    cve.descriptions = [
      { lang: "en", value: "Updated description after NVD revision (fixture)." },
    ];
    if (cve.metrics?.cvssMetricV31?.[0]?.cvssData) {
      cve.metrics.cvssMetricV31[0].cvssData.baseScore = 7.5;
      cve.metrics.cvssMetricV31[0].cvssData.baseSeverity = "HIGH";
      cve.metrics.cvssMetricV31[0].cvssData.vectorString =
        "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N";
    }

    const third = await runNvdSync({
      db,
      payload: { mode: "full", cveId: "CVE-2024-0001" },
      clientOptions: {
        fetch: async () =>
          new Response(JSON.stringify(mutated), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        sleep,
        config: { apiKey: "test-key", maxRetries: 2, noKeyPauseMs: 0 },
        random: () => 0,
      },
      now: new Date("2024-03-01T02:00:00.000Z"),
    });

    expect(third.upserted).toBe(1);
    const vulns3 = await db.select().from(vulnerabilities);
    expect(vulns3).toHaveLength(1);
    expect(vulns3[0].description).toContain("Updated description");
    expect(vulns3[0].severity).toBe("high");
    expect(Number(vulns3[0].cvssScore)).toBe(7.5);

    const history = await db
      .select()
      .from(vulnerabilityHistory)
      .where(eq(vulnerabilityHistory.vulnerabilityId, vulns3[0].id));

    const fields = history.map((h) => h.field);
    expect(fields).toContain("source_sync");
    expect(fields).toContain("description");
    expect(fields).toContain("severity");
    expect(fields).toContain("cvssScore");
  });
});
