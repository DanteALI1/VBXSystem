import { createQueue, QUEUE_NAMES } from "@/lib/queue";
import type { NvdSyncJobPayload } from "./types";

export const NVD_SYNC_JOB_NAME = "nvd-sync";

let nvdQueue: ReturnType<typeof createQueue> | null = null;

export function getNvdSyncQueue() {
  if (!nvdQueue) {
    nvdQueue = createQueue(QUEUE_NAMES.nvdSync);
  }
  return nvdQueue;
}

/**
 * Enqueue NVD sync. Returns immediately with BullMQ job id (HTTP must not block on sync).
 */
export async function enqueueNvdSync(payload: NvdSyncJobPayload = {}) {
  const queue = getNvdSyncQueue();
  const job = await queue.add(
    NVD_SYNC_JOB_NAME,
    {
      type: NVD_SYNC_JOB_NAME,
      requestedByUserId: payload.requestedByUserId,
      requestedAt: payload.requestedAt ?? new Date().toISOString(),
      payload: {
        mode: payload.mode ?? "incremental",
        lastModStartDate: payload.lastModStartDate,
        lastModEndDate: payload.lastModEndDate,
        cveId: payload.cveId,
      },
    },
    {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
    },
  );

  return { jobId: String(job.id), queue: QUEUE_NAMES.nvdSync };
}
