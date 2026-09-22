import { Queue } from "bullmq";
import IORedis from "ioredis";
import pino from "pino";

const logger = pino({
  name: "worker",
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

const queueNames = ["nvd-sync", "bdu-sync", "scan"] as const;

const queues = queueNames.map(
  (name) =>
    new Queue(name, {
      connection,
    }),
);

logger.info(
  { queues: queueNames, redisUrl },
  "worker ready (Wave 0 stub — no processors registered)",
);

async function shutdown() {
  logger.info("shutting down worker");
  await Promise.all(queues.map((q) => q.close()));
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
