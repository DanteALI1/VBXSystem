import path from "node:path";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * TC-012 nmap fixture → services (idempotent upsert)
 */
describe("TC-012 nmap fixture ingest", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db/schema");
  let processScanJob: typeof import("@/lib/scans").processScanJob;
  let enqueueScanJob: typeof import("@/lib/scans").enqueueScanJob;

  const fixture = path.join(process.cwd(), "tests/fixtures/nmap-sample.xml");

  beforeAll(async () => {
    process.env.SCAN_ADAPTER_MODE = "fixture";
    ({ db } = await import("@/db"));
    schema = await import("@/db/schema");
    ({ processScanJob, enqueueScanJob } = await import("@/lib/scans"));

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

    await db.insert(schema.allowlistTargets).values({
      pattern: "10.0.0.0/8",
      patternType: "cidr",
      enabled: true,
    });
  });

  it("upserts services from nmap fixture; re-ingest updates lastSeenAt", async () => {
    const created = await enqueueScanJob({
      type: "nmap",
      targets: ["10.0.0.5"],
      options: { fixturePath: fixture },
      createdById: "tc-test-user-analyst",
      skipQueue: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const jobId = created.job.id;

    await processScanJob({
      id: "bull-1",
      data: { type: "scan-run", scanJobId: jobId },
    } as Parameters<typeof processScanJob>[0]);

    const [job1] = await db
      .select()
      .from(schema.scanJobs)
      .where(eq(schema.scanJobs.id, jobId));
    expect(job1.status).toBe("succeeded");
    expect(job1.reportPath).toBeTruthy();
    expect(job1.reportPath).toContain(path.join("storage", "reports", jobId));

    const svcs = await db.select().from(schema.services);
    expect(svcs.length).toBeGreaterThanOrEqual(2);
    const ports = svcs.map((s) => s.port).sort((a, b) => a - b);
    expect(ports).toEqual(expect.arrayContaining([22, 80]));

    const ssh = svcs.find((s) => s.port === 22);
    expect(ssh?.product).toBe("OpenSSH");
    expect(ssh?.lastSeenAt).toBeTruthy();
    const firstSeen = ssh!.lastSeenAt!.getTime();

    // Re-run ingest via a second job on same fixture
    await new Promise((r) => setTimeout(r, 20));
    const created2 = await enqueueScanJob({
      type: "nmap",
      targets: ["10.0.0.5"],
      options: { fixturePath: fixture },
      createdById: "tc-test-user-analyst",
      skipQueue: true,
    });
    expect(created2.ok).toBe(true);
    if (!created2.ok) return;

    await processScanJob({
      id: "bull-2",
      data: { type: "scan-run", scanJobId: created2.job.id },
    } as Parameters<typeof processScanJob>[0]);

    const svcs2 = await db.select().from(schema.services);
    // No duplicate services for same asset/port/proto
    const sshRows = svcs2.filter(
      (s) => s.port === 22 && s.protocol === "tcp",
    );
    expect(sshRows).toHaveLength(1);
    expect(sshRows[0].lastSeenAt!.getTime()).toBeGreaterThanOrEqual(firstSeen);

    // Unique constraint sanity: one row per port
    const tcp80 = await db
      .select()
      .from(schema.services)
      .where(and(eq(schema.services.port, 80), eq(schema.services.protocol, "tcp")));
    expect(tcp80).toHaveLength(1);
  });
});
