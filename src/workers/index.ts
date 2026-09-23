/**
 * Worker entrypoint — Wave 0 skeleton.
 * Real NVD/BDU/scan processors land in Waves 2–3.
 */
import { Worker } from "bullmq";
import { getRedisConnection, QUEUE_NAMES } from "@/lib/queue";
import { logger } from "@/lib/logger";

const connection = getRedisConnection();

const nvdWorker = new Worker(
  QUEUE_NAMES.nvdSync,
  async (job) => {
    logger.info({ jobId: job.id, name: job.name }, "nvd-sync job received (stub)");
  },
  { connection },
);

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

logger.info("VBX worker started (Wave 0 stubs)");

process.on("SIGINT", async () => {
  await Promise.all([nvdWorker.close(), bduWorker.close(), scanWorker.close()]);
  process.exit(0);
});
