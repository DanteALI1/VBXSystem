import { Worker, type Job } from "bullmq";
import type { Logger } from "pino";
import { runScanJob } from "@/lib/scans";
import { createRedisConnection } from "@/lib/sync/queues";
import { SCAN_QUEUE_NAME, type ScanJobData } from "@/lib/sync/types";

export function createScanWorker(logger: Logger) {
  const connection = createRedisConnection();

  const worker = new Worker<ScanJobData>(
    SCAN_QUEUE_NAME,
    async (job: Job<ScanJobData>) => {
      const scanJobId = job.data.scanJobId;
      logger.info(
        { bullmqJobId: job.id, scanJobId, name: job.name },
        "scan job started",
      );
      const result = await runScanJob(scanJobId);
      if (result.status === "failed") {
        logger.warn(
          { scanJobId, error: result.error },
          "scan job finished with failed status",
        );
      } else {
        logger.info(
          {
            scanJobId,
            findingsCreated: result.findingsCreated,
            servicesUpserted: result.servicesUpserted,
            fixture: result.fixture,
          },
          "scan job completed",
        );
      }
      return result;
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, scanJobId: job?.data?.scanJobId, err: err.message },
      "scan job failed",
    );
  });

  return { worker, connection };
}

/** @deprecated Use createScanWorker — stub retained name for import safety. */
export const createScanStubWorker = createScanWorker;
