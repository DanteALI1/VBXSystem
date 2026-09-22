import { Worker, type Job } from "bullmq";
import type { Logger } from "pino";
import { createRedisConnection } from "@/lib/sync/queues";
import { SCAN_QUEUE_NAME } from "@/lib/sync/types";

/**
 * Wave 2 stub — scan queue registered so jobs are consumed without work.
 * Real adapters land in a later wave.
 */
export function createScanStubWorker(logger: Logger) {
  const connection = createRedisConnection();

  const worker = new Worker(
    SCAN_QUEUE_NAME,
    async (job: Job) => {
      logger.info(
        { jobId: job.id, name: job.name },
        "scan job received (stub — no adapter)",
      );
      return { stub: true };
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, err: err.message },
      "scan stub job failed",
    );
  });

  return { worker, connection };
}
