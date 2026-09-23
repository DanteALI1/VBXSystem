import { Queue } from "bullmq";
import IORedis from "ioredis";

export const QUEUE_NAMES = {
  nvdSync: "nvd-sync",
  bduSync: "bdu-sync",
  scan: "scan",
} as const;

let connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

export function createQueue(name: string): Queue {
  return new Queue(name, { connection: getRedisConnection() });
}
