import { count, eq } from "drizzle-orm";
import { findings, scanJobs, services } from "@/db/schema";
import { db } from "@/lib/db/client";
import { assertTargetAllowed, runScanJob } from "@/lib/scans";

/**
 * Smoke: create nmap fixture scan, process inline, print finding/service counts.
 * Does not enqueue BullMQ (avoids double-run if a worker is already up).
 * For queue path: POST /api/scans with { fixture: true } while `npm run worker` runs.
 */
async function main() {
  await assertTargetAllowed("10.0.1.10");

  const [created] = await db
    .insert(scanJobs)
    .values({
      type: "nmap",
      status: "queued",
      target: "10.0.1.10",
      optionsJson: { fixture: true },
    })
    .returning();

  console.log("created", { id: created.id, status: created.status });

  const result = await runScanJob(created.id);
  console.log("runScanJob", result);

  const [job] = await db
    .select()
    .from(scanJobs)
    .where(eq(scanJobs.id, created.id))
    .limit(1);

  const [findingsCount] = await db
    .select({ value: count() })
    .from(findings)
    .where(eq(findings.scanJobId, created.id));

  const findingRows = await db
    .select({
      title: findings.title,
      severity: findings.severity,
      cveId: findings.cveId,
      assetId: findings.assetId,
    })
    .from(findings)
    .where(eq(findings.scanJobId, created.id));

  const assetId = findingRows[0]?.assetId ?? null;
  let serviceCount = 0;
  if (assetId) {
    const [row] = await db
      .select({ value: count() })
      .from(services)
      .where(eq(services.assetId, assetId));
    serviceCount = row?.value ?? 0;
  }

  console.log({
    status: job?.status,
    error: job?.error,
    findings: findingsCount?.value ?? 0,
    services: serviceCount,
    sampleFindings: findingRows.slice(0, 5),
  });

  if (job?.status !== "succeeded") {
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
