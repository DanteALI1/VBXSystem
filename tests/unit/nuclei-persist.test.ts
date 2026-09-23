import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "@/lib/db/client";
import { findings, scanJobs } from "@/db/schema";
import { NucleiAdapter, persistFindingDrafts } from "@/lib/scanners";

describe("nuclei fixture → findings", () => {
  const createdJobIds: string[] = [];

  afterAll(async () => {
    for (const id of createdJobIds) {
      await db.delete(findings).where(eq(findings.scanJobId, id));
      await db.delete(scanJobs).where(eq(scanJobs.id, id));
    }
  });

  it("adapter fixture start + parse + persist creates findings", async () => {
    const [job] = await db
      .insert(scanJobs)
      .values({
        type: "nuclei",
        status: "queued",
        target: "10.0.1.10",
        optionsJson: { fixture: true },
      })
      .returning();
    createdJobIds.push(job.id);

    const reportDir = mkdtempSync(join(tmpdir(), "nuclei-fixture-"));
    try {
      const adapter = new NucleiAdapter();
      const report = await adapter.start({
        job,
        reportDir,
        options: { fixture: true },
      });
      expect(report.fixture).toBe(true);

      const drafts = await adapter.parse(report);
      expect(drafts).toHaveLength(5);

      const result = await persistFindingDrafts({
        drafts,
        scanJobId: job.id,
        target: job.target,
      });
      expect(result.findingsCreated).toBe(5);

      const rows = await db
        .select()
        .from(findings)
        .where(eq(findings.scanJobId, job.id));
      expect(rows).toHaveLength(5);
      expect(rows.every((r) => r.status === "open")).toBe(true);
      expect(rows.some((r) => r.cveId === "CVE-2021-44228")).toBe(true);
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  });
});
