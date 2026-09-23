/**
 * Worker entrypoint — NVD + BDU + Scan processors.
 */
import { Worker } from "bullmq";
import { getRedisConnection, QUEUE_NAMES } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { processNvdSyncJob } from "@/workers/nvd/processor";
import { processBduSyncJob } from "@/workers/bdu-processor";
import { processScanJob } from "@/workers/scan-processor";

const connection = getRedisConnection();

const nvdWorker = new Worker(QUEUE_NAMES.nvdSync, processNvdSyncJob, {
  connection,
  concurrency: 1,
});

const bduWorker = new Worker(
  QUEUE_NAMES.bduSync,
  async (job) => processBduSyncJob(job),
  { connection, concurrency: 1 },
);

const scanWorker = new Worker(QUEUE_NAMES.scan, processScanJob, {
  connection,
  concurrency: 1,
});

for (const w of [nvdWorker, bduWorker, scanWorker]) {
  w.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "worker job failed");
  });
}

logger.info("VBX worker started (NVD + BDU + scan)");

process.on("SIGINT", async () => {
  await Promise.all([nvdWorker.close(), bduWorker.close(), scanWorker.close()]);
  process.exit(0);
});
