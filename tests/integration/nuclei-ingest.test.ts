import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * TC-013 nuclei fixture → findings + template path deny
 */
describe("TC-013 nuclei fixture ingest", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db/schema");
  let processScanJob: typeof import("@/lib/scans").processScanJob;
  let enqueueScanJob: typeof import("@/lib/scans").enqueueScanJob;
  let validateNucleiTemplateOptions: typeof import("@/lib/scans").validateNucleiTemplateOptions;
  let NucleiTemplateDeniedError: typeof import("@/lib/scans").NucleiTemplateDeniedError;

  const fixture = path.join(
    process.cwd(),
    "tests/fixtures/nuclei-sample.jsonl",
  );

  beforeAll(async () => {
    process.env.SCAN_ADAPTER_MODE = "fixture";
    ({ db } = await import("@/db"));
    schema = await import("@/db/schema");
    ({
      processScanJob,
      enqueueScanJob,
      validateNucleiTemplateOptions,
      NucleiTemplateDeniedError,
    } = await import("@/lib/scans"));

    await db
      .insert(schema.user)
      .values({
        id: "tc-test-user-analyst",
        name: "analyst",
        email: "analyst@test.local",
        emailVerified: true,
        role: "analyst",
      })
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    await db.delete(schema.findings);
    await db.delete(schema.services);
    await db.delete(schema.scanJobs);
    await db.delete(schema.assets);
    await db.delete(schema.allowlistTargets);
    // keep vulnerabilities for CVE link if present — clean only our CVE if inserted
    await db
      .delete(schema.vulnerabilities)
      .where(eq(schema.vulnerabilities.cveId, "CVE-2024-0001"));

    await db.insert(schema.allowlistTargets).values({
      pattern: "10.0.0.0/8",
      patternType: "cidr",
      enabled: true,
    });
  });

  it("creates findings from nuclei fixture; denies exploit paths; dedups", async () => {
    // Path escape / non-allowed templates → fail before start
    expect(() =>
      validateNucleiTemplateOptions({ templates: ["../../exploits"] }),
    ).toThrow(NucleiTemplateDeniedError);
    expect(() =>
      validateNucleiTemplateOptions({ templates: ["exploits/rce"] }),
    ).toThrow(NucleiTemplateDeniedError);
    expect(() =>
      validateNucleiTemplateOptions({ tags: ["intrusive"] }),
    ).toThrow(NucleiTemplateDeniedError);

    const denied = await enqueueScanJob({
      type: "nuclei",
      targets: ["10.0.0.5"],
      options: { templates: ["../../exploits"] },
      createdById: "tc-test-user-analyst",
      skipQueue: true,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.code).toBe("NUCLEI_TEMPLATE_DENIED");
    }

    // Seed vulnerability for CVE link
    await db.insert(schema.vulnerabilities).values({
      cveId: "CVE-2024-0001",
      title: "ExampleCorp Widget RCE Detection",
      description: "test",
      severity: "critical",
    });

    const created = await enqueueScanJob({
      type: "nuclei",
      targets: ["10.0.0.5"],
      options: {
        fixturePath: fixture,
        templates: ["cves", "vulnerabilities"],
      },
      createdById: "tc-test-user-analyst",
      skipQueue: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await processScanJob({
      id: "bull-n1",
      data: { type: "scan-run", scanJobId: created.job.id },
    } as Parameters<typeof processScanJob>[0]);

    const [job] = await db
      .select()
      .from(schema.scanJobs)
      .where(eq(schema.scanJobs.id, created.job.id));
    expect(job.status).toBe("succeeded");
    expect(job.reportPath).toContain(
      path.join("storage", "reports", created.job.id),
    );

    const rows = await db.select().from(schema.findings);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const finding = rows[0];
    expect(finding.status).toBe("open");
    expect(finding.cveId).toBe("CVE-2024-0001");
    expect(finding.severity).toBe("critical");
    expect(finding.vulnerabilityId).toBeTruthy();
    expect(finding.rawEvidence).toBeTruthy();

    // Dedup on re-ingest
    const created2 = await enqueueScanJob({
      type: "nuclei",
      targets: ["10.0.0.5"],
      options: {
        fixturePath: fixture,
        templates: ["cves"],
      },
      createdById: "tc-test-user-analyst",
      skipQueue: true,
    });
    expect(created2.ok).toBe(true);
    if (!created2.ok) return;

    await processScanJob({
      id: "bull-n2",
      data: { type: "scan-run", scanJobId: created2.job.id },
    } as Parameters<typeof processScanJob>[0]);

    const rows2 = await db.select().from(schema.findings);
    expect(rows2).toHaveLength(1);
    expect(rows2[0].updatedAt.getTime()).toBeGreaterThanOrEqual(
      finding.updatedAt.getTime(),
    );
  });
});
