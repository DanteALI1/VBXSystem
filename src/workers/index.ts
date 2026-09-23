/**
 * Worker entrypoint — NVD sync processor (Wave 2) + BDU/scan stubs.
 */
import { Worker } from "bullmq";
import { getRedisConnection, QUEUE_NAMES } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { processNvdSyncJob } from "@/workers/nvd/processor";

const connection = getRedisConnection();

const nvdWorker = new Worker(QUEUE_NAMES.nvdSync, processNvdSyncJob, {
  connection,
  concurrency: 1,
});

const bduWorker = new Worker(
  QUEUE_NAMES.bduSync,
  async (job) => {
    logger.info({ jobId: job.id, name: job.name }, "bdu-sync job received (stub)");
  },
  { connection },
);

const scanWorker = new Worker(
  QUEUE_NAMES.scan,
  async (job) => {
    logger.info({ jobId: job.id, name: job.name }, "scan job received (stub)");
  },
  { connection },
);

for (const w of [nvdWorker, bduWorker, scanWorker]) {
  w.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "worker job failed");
  });
}

logger.info("VBX worker started (NVD sync active; BDU/scan stubs)");

process.on("SIGINT", async () => {
  await Promise.all([nvdWorker.close(), bduWorker.close(), scanWorker.close()]);
  process.exit(0);
});
