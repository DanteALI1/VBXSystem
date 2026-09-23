import type { Job } from "bullmq";
import { logger } from "@/lib/logger";
import { runBduSync, type BduSyncJobPayload } from "@/lib/sync/bdu";

type Envelope = {
  type?: string;
  requestedByUserId?: string;
  requestedAt?: string;
  payload?: BduSyncJobPayload;
} & Partial<BduSyncJobPayload>;

function resolvePayload(data: Envelope): BduSyncJobPayload {
  if (data.payload?.mode) {
    return {
      ...data.payload,
      requestedByUserId:
        data.payload.requestedByUserId ?? data.requestedByUserId,
      requestedAt: data.payload.requestedAt ?? data.requestedAt,
    };
  }
  if (data.mode) {
    return {
      mode: data.mode,
      filePath: data.filePath,
      xml: data.xml,
      force: data.force,
      requestedByUserId: data.requestedByUserId,
      requestedAt: data.requestedAt,
    };
  }
  throw new Error("Invalid bdu-sync job: missing mode");
}

export async function processBduSyncJob(job: Job<Envelope>) {
  const payload = resolvePayload(job.data ?? {});
  logger.info(
    {
      jobId: job.id,
      mode: payload.mode,
      requestedByUserId: payload.requestedByUserId,
    },
    "bdu-sync job start",
  );
  const result = await runBduSync(payload);
  logger.info(
    {
      jobId: job.id,
      fileHash: result.fileHash.slice(0, 12),
      upserted: result.stats.upserted,
      linked: result.stats.linked,
    },
    "bdu-sync job done",
  );
  return result;
}
