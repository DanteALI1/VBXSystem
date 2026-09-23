import pino from "pino";
import { createBduSyncWorker } from "./processors/bdu";
import { createNvdSyncWorker } from "./processors/nvd";
import { createScanWorker } from "./processors/scan";
import { getRedisUrl } from "@/lib/sync/queues";

const logger = pino({
  name: "worker",
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

const redisUrl = getRedisUrl();

const nvd = createNvdSyncWorker(logger);
const bdu = createBduSyncWorker(logger);
const scan = createScanWorker(logger);

logger.info(
  {
    queues: ["nvd-sync", "bdu-sync", "scan"],
    redisUrl,
  },
  "worker ready — processors registered",
);

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down worker");
  await Promise.all([
    nvd.worker.close(),
    bdu.worker.close(),
    scan.worker.close(),
  ]);
  await Promise.all([
    nvd.connection.quit(),
    bdu.connection.quit(),
    scan.connection.quit(),
  ]);
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
