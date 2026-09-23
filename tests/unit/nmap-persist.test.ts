import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { findings, scanJobs, services } from "@/db/schema";
import { NmapAdapter, persistFindingDrafts, parseNmapXml } from "@/lib/scanners";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

describe("nmap fixture → services/findings", () => {
  const createdJobIds: string[] = [];

  afterAll(async () => {
    for (const id of createdJobIds) {
      await db.delete(findings).where(eq(findings.scanJobId, id));
      await db.delete(scanJobs).where(eq(scanJobs.id, id));
    }
  });

  it("adapter fixture start + parse + persist upserts services and findings", async () => {
    const [job] = await db
      .insert(scanJobs)
      .values({
        type: "nmap",
        status: "queued",
        target: "10.0.1.10",
        optionsJson: { fixture: true },
      })
      .returning();
    createdJobIds.push(job.id);

    const reportDir = mkdtempSync(join(tmpdir(), "nmap-fixture-"));
    try {
      const adapter = new NmapAdapter();
      const report = await adapter.start({
        job,
        reportDir,
        options: { fixture: true },
      });
      expect(report.fixture).toBe(true);
      expect(report.rawPath).toMatch(/raw\.xml$/);

      const drafts = await adapter.parse(report);
      expect(drafts.length).toBeGreaterThanOrEqual(3);

      const result = await persistFindingDrafts({
        drafts,
        scanJobId: job.id,
        target: job.target,
      });

      expect(result.findingsCreated).toBe(drafts.length);
      expect(result.servicesUpserted).toBeGreaterThanOrEqual(3);
      expect(result.assetId).toBeTruthy();

      const serviceRows = await db
        .select()
        .from(services)
        .where(eq(services.assetId, result.assetId!));
      const ports = new Set(serviceRows.map((s) => s.port));
      expect(ports.has(22)).toBe(true);
      expect(ports.has(80)).toBe(true);
      expect(ports.has(443)).toBe(true);

      const findingRows = await db
        .select()
        .from(findings)
        .where(eq(findings.scanJobId, job.id));
      expect(findingRows.length).toBe(drafts.length);

      // idempotent service upsert on re-parse
      const again = await persistFindingDrafts({
        drafts: parseNmapXml(
          readFileSync(join(process.cwd(), "tests/fixtures/nmap-sample.xml"), "utf8"),
        ),
        scanJobId: job.id,
        target: job.target,
        defaultAssetId: result.assetId,
      });
      expect(again.servicesUpserted).toBeGreaterThanOrEqual(1);

      const serviceRows2 = await db
        .select()
        .from(services)
        .where(eq(services.assetId, result.assetId!));
      // still one row per port/protocol
      const portProto = serviceRows2.map((s) => `${s.port}/${s.protocol}`);
      expect(new Set(portProto).size).toBe(portProto.length);
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  });
});
