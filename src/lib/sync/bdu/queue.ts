import type { JobsOptions } from "bullmq";
import { createQueue, QUEUE_NAMES } from "@/lib/queue";
import type { BduSyncJobPayload } from "./types";

let queue: ReturnType<typeof createQueue> | null = null;

export function getBduSyncQueue() {
  if (!queue) {
    queue = createQueue(QUEUE_NAMES.bduSync);
  }
  return queue;
}

export const BDU_JOB_NAME = "bdu-sync" as const;

export async function enqueueBduSync(
  payload: BduSyncJobPayload,
  opts?: JobsOptions,
) {
  const q = getBduSyncQueue();
  const job = await q.add(
    BDU_JOB_NAME,
    {
      type: BDU_JOB_NAME,
      requestedByUserId: payload.requestedByUserId,
      requestedAt: payload.requestedAt ?? new Date().toISOString(),
      payload,
    },
    {
      removeOnComplete: 100,
      removeOnFail: 50,
      ...opts,
    },
  );
  return job;
}
