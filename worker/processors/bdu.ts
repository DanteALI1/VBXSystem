import { Worker, type Job } from "bullmq";
import type { Logger } from "pino";
import { runBduSync } from "@/lib/bdu/sync";
import { createRedisConnection } from "@/lib/sync/queues";
import { BDU_QUEUE_NAME, type BduSyncJobData } from "@/lib/sync/types";

export function createBduSyncWorker(logger: Logger) {
  const connection = createRedisConnection();

  const worker = new Worker<BduSyncJobData>(
    BDU_QUEUE_NAME,
    async (job: Job<BduSyncJobData>) => {
      logger.info(
        { jobId: job.id, data: job.data },
        "bdu-sync job started",
      );
      const result = await runBduSync(job.data);
      logger.info({ jobId: job.id, result }, "bdu-sync job completed");
      return result;
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, err: err.message },
      "bdu-sync job failed",
    );
  });

  return { worker, connection };
}
