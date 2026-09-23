import { eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { db } from "@/db";
import { scanJobs } from "@/db/schema";
import { logger } from "@/lib/logger";
import { getAdapter } from "@/lib/scans/adapter";
import {
  assertTargetsAllowed,
  AllowlistRejectedError,
} from "@/lib/scans/allowlist-gate";
import { ingestScanReport } from "@/lib/scans/ingest";
import { ensureReportDir } from "@/lib/scans/report-store";
import { reportDirForJob } from "@/lib/scans/report-store";
import type { ScanJobContext } from "@/lib/scans/types";
import { ALLOWLIST_REJECTED, SCANNER_NOT_IMPLEMENTED } from "@/lib/scans/types";
import { NucleiTemplateDeniedError } from "@/lib/scans/nuclei-policy";

export type ScanQueuePayload = {
  type: string;
  scanJobId: string;
  requestedByUserId?: string;
  requestedAt?: string;
};

async function markFailed(jobId: string, errorMessage: string) {
  await db
    .update(scanJobs)
    .set({
      status: "failed",
      errorMessage,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(scanJobs.id, jobId));
}

/**
 * BullMQ processor for scan jobs.
 * Re-checks allowlist before any binary/fixture start — no scanning outside allowlist.
 */
export async function processScanJob(job: Job<ScanQueuePayload>) {
  const scanJobId = job.data.scanJobId;
  if (!scanJobId) {
    throw new Error("scanJobId missing from queue payload");
  }

  const [scanJob] = await db
    .select()
    .from(scanJobs)
    .where(eq(scanJobs.id, scanJobId))
    .limit(1);

  if (!scanJob) {
    throw new Error(`ScanJob not found: ${scanJobId}`);
  }

  if (scanJob.status === "succeeded" || scanJob.status === "failed") {
    logger.info({ scanJobId, status: scanJob.status }, "scan job already terminal");
    return { skipped: true, status: scanJob.status };
  }

  try {
    await assertTargetsAllowed(scanJob.targets);
  } catch (err) {
    if (err instanceof AllowlistRejectedError) {
      await markFailed(scanJobId, ALLOWLIST_REJECTED);
      logger.warn(
        { scanJobId, rejected: err.rejected },
        "scan rejected by allowlist gate",
      );
      return { ok: false, code: ALLOWLIST_REJECTED };
    }
    throw err;
  }

  const adapter = getAdapter(scanJob.type);

  try {
    adapter.validateOptions?.(scanJob.options ?? {});
  } catch (err) {
    if (err instanceof NucleiTemplateDeniedError) {
      await markFailed(scanJobId, err.code);
      return { ok: false, code: err.code };
    }
    throw err;
  }

  await db
    .update(scanJobs)
    .set({
      status: "running",
      startedAt: new Date(),
      updatedAt: new Date(),
      errorMessage: null,
    })
    .where(eq(scanJobs.id, scanJobId));

  const reportDir = await ensureReportDir(scanJobId);
  const ctx: ScanJobContext = {
    id: scanJobId,
    type: scanJob.type,
    targets: scanJob.targets,
    options: scanJob.options ?? {},
    reportDir: reportDirForJob(scanJobId),
  };

  try {
    const started = await adapter.start(ctx);
    const ingest = await ingestScanReport(
      { ...scanJob, status: "running", reportPath: started.reportPath },
      started.reportPath,
    );

    await db
      .update(scanJobs)
      .set({
        status: "succeeded",
        reportPath: started.reportPath,
        finishedAt: new Date(),
        updatedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(scanJobs.id, scanJobId));

    logger.info(
      {
        scanJobId,
        usedFixture: started.usedFixture,
        servicesUpserted: ingest.servicesUpserted,
        findingsUpserted: ingest.findingsUpserted,
        reportDir,
      },
      "scan job succeeded",
    );

    return {
      ok: true,
      usedFixture: started.usedFixture,
      servicesUpserted: ingest.servicesUpserted,
      findingsUpserted: ingest.findingsUpserted,
    };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : null;
    const message =
      code === SCANNER_NOT_IMPLEMENTED
        ? SCANNER_NOT_IMPLEMENTED
        : err instanceof Error
          ? err.message.slice(0, 500)
          : "scan failed";
    await markFailed(scanJobId, message);
    logger.error({ scanJobId, err }, "scan job failed");
    throw err;
  }
}
