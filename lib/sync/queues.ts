import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import {
  BDU_QUEUE_NAME,
  NVD_QUEUE_NAME,
  SCAN_QUEUE_NAME,
  type BduSyncJobData,
  type NvdSyncJobData,
} from "@/lib/sync/types";

let sharedConnection: IORedis | null = null;
let nvdQueue: Queue<NvdSyncJobData> | null = null;
let bduQueue: Queue<BduSyncJobData> | null = null;
let scanQueue: Queue | null = null;

export function getRedisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6379";
}

export function createRedisConnection(): IORedis {
  return new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: null,
  });
}

export function getSharedConnection(): IORedis {
  if (!sharedConnection) {
    sharedConnection = createRedisConnection();
  }
  return sharedConnection;
}

export function bullmqConnection(): ConnectionOptions {
  return getSharedConnection() as unknown as ConnectionOptions;
}

export function getNvdQueue(): Queue<NvdSyncJobData> {
  if (!nvdQueue) {
    nvdQueue = new Queue<NvdSyncJobData>(NVD_QUEUE_NAME, {
      connection: bullmqConnection(),
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
        attempts: 1,
      },
    });
  }
  return nvdQueue;
}

export function getBduQueue(): Queue<BduSyncJobData> {
  if (!bduQueue) {
    bduQueue = new Queue<BduSyncJobData>(BDU_QUEUE_NAME, {
      connection: bullmqConnection(),
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
        attempts: 1,
      },
    });
  }
  return bduQueue;
}

export function getScanQueue(): Queue {
  if (!scanQueue) {
    scanQueue = new Queue(SCAN_QUEUE_NAME, {
      connection: bullmqConnection(),
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    });
  }
  return scanQueue;
}

export async function enqueueNvdSync(
  data: NvdSyncJobData = {},
): Promise<{ jobId: string }> {
  const job = await getNvdQueue().add("nvd-sync", data);
  return { jobId: String(job.id) };
}

export async function enqueueBduSync(
  data: BduSyncJobData = {},
): Promise<{ jobId: string }> {
  const job = await getBduQueue().add("bdu-sync", data);
  return { jobId: String(job.id) };
}

export async function getRecentJobInfo(queueName: string) {
  const queue =
    queueName === NVD_QUEUE_NAME
      ? getNvdQueue()
      : queueName === BDU_QUEUE_NAME
        ? getBduQueue()
        : null;
  if (!queue) return null;

  const [active, waiting, completed, failed] = await Promise.all([
    queue.getJobs(["active"], 0, 2),
    queue.getJobs(["waiting"], 0, 2),
    queue.getJobs(["completed"], 0, 2),
    queue.getJobs(["failed"], 0, 2),
  ]);

  const pick = [...active, ...waiting, ...completed, ...failed][0];
  if (!pick) return null;

  return {
    id: String(pick.id),
    name: pick.name,
    state: await pick.getState(),
    timestamp: pick.timestamp,
    finishedOn: pick.finishedOn ?? null,
    failedReason: pick.failedReason ?? null,
  };
}
