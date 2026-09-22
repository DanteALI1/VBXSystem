import { Worker, type Job } from "bullmq";
import type { Logger } from "pino";
import { runNvdSync } from "@/lib/nvd/sync";
import { createRedisConnection } from "@/lib/sync/queues";
import { NVD_QUEUE_NAME, type NvdSyncJobData } from "@/lib/sync/types";

export function createNvdSyncWorker(logger: Logger) {
  const connection = createRedisConnection();

  const worker = new Worker<NvdSyncJobData>(
    NVD_QUEUE_NAME,
    async (job: Job<NvdSyncJobData>) => {
      logger.info(
        { jobId: job.id, data: job.data },
        "nvd-sync job started",
      );
      const result = await runNvdSync(job.data);
      logger.info({ jobId: job.id, result }, "nvd-sync job completed");
      return result;
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, err: err.message },
      "nvd-sync job failed",
    );
  });

  return { worker, connection };
}
