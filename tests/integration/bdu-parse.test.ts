import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  syncState,
  vulnerabilities,
  vulnerabilityHistory,
  vulnerabilitySources,
} from "@/db/schema";
import { parseBduXml, runBduSync, upsertBduRecords } from "@/lib/sync/bdu";
import { createTestDb, truncateBduTables, type TestDb } from "./helpers/db";

const FIXTURE = resolve(process.cwd(), "tests/fixtures/bdu-mini.xml");

describe("TC-007 BDU XML parse + CVE link", () => {
  let db: TestDb;
  let close: () => Promise<void>;

  beforeAll(() => {
    const handle = createTestDb();
    db = handle.db;
    close = handle.close;
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateBduTables(db);
  });

  it("parses fixture: linked CVE, bdu-only, skips broken node", () => {
    const xml = readFileSync(FIXTURE, "utf8");
    const { records, skipped } = parseBduXml(xml);
    expect(skipped).toBeGreaterThanOrEqual(1);
    expect(records).toHaveLength(2);

    const withCve = records.find((r) => r.bduId === "BDU:2024-00001");
    const noCve = records.find((r) => r.bduId === "BDU:2024-00002");
    expect(withCve?.cveId).toBe("CVE-2024-0001");
    expect(withCve?.vendors).toContain("ExampleCorp");
    expect(noCve?.cveId).toBeNull();
    expect(noCve?.severity).toBe("medium");
  });

  it("upserts by bduId, links CVE, writes source + history; no duplicate cve rows", async () => {
    // Pre-existing NVD-only card for the same CVE
    await db.insert(vulnerabilities).values({
      cveId: "CVE-2024-0001",
      title: "NVD preseed",
      description: "From NVD",
      severity: "high",
      cvssScore: "7.5",
      vendors: ["ExampleCorp"],
      products: ["Widget"],
    });

    const xml = readFileSync(FIXTURE, "utf8");
    const result = await runBduSync({
      mode: "upload",
      xml,
      db,
      // Never hit network
      downloadFn: async () => {
        throw new Error("download must not be called in upload mode");
      },
    });

    expect(result.stats.upserted).toBe(2);
    expect(result.fileHash).toMatch(/^[a-f0-9]{64}$/);

    const linked = await db
      .select()
      .from(vulnerabilities)
      .where(eq(vulnerabilities.bduId, "BDU:2024-00001"));
    expect(linked).toHaveLength(1);
    expect(linked[0].cveId).toBe("CVE-2024-0001");

    const cveRows = await db
      .select()
      .from(vulnerabilities)
      .where(eq(vulnerabilities.cveId, "CVE-2024-0001"));
    expect(cveRows).toHaveLength(1);

    const sources = await db
      .select()
      .from(vulnerabilitySources)
      .where(eq(vulnerabilitySources.vulnerabilityId, linked[0].id));
    expect(sources.some((s) => s.source === "bdu")).toBe(true);

    const history = await db
      .select()
      .from(vulnerabilityHistory)
      .where(eq(vulnerabilityHistory.vulnerabilityId, linked[0].id));
    expect(history.some((h) => h.field === "bduId" && h.newValue === "BDU:2024-00001")).toBe(
      true,
    );

    const bduOnly = await db
      .select()
      .from(vulnerabilities)
      .where(eq(vulnerabilities.bduId, "BDU:2024-00002"));
    expect(bduOnly).toHaveLength(1);
    expect(bduOnly[0].cveId).toBeNull();

    const [state] = await db
      .select()
      .from(syncState)
      .where(eq(syncState.source, "bdu"));
    expect(state?.cursor).toBe(result.fileHash);
    expect(state?.lastSuccessAt).toBeTruthy();
    expect(state?.lastError).toBeNull();
    expect((state?.meta as { fileHash?: string })?.fileHash).toBe(result.fileHash);
  });

  it("is idempotent on second upsert (no duplicate bduId)", async () => {
    const xml = readFileSync(FIXTURE, "utf8");
    const { records } = parseBduXml(xml);
    await upsertBduRecords(db, records);
    await upsertBduRecords(db, records);

    const all = await db.select().from(vulnerabilities);
    const bduIds = all.map((r) => r.bduId).filter(Boolean);
    expect(new Set(bduIds).size).toBe(bduIds.length);
    expect(bduIds).toContain("BDU:2024-00001");
    expect(bduIds).toContain("BDU:2024-00002");
  });
});
