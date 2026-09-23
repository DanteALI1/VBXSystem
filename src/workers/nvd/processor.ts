import type { Job } from "bullmq";
import { db } from "@/db";
import { logger } from "@/lib/logger";
import { runNvdSync, type NvdSyncJobPayload } from "@/lib/sync/nvd";

type JobData = {
  type?: string;
  requestedByUserId?: string;
  requestedAt?: string;
  payload?: NvdSyncJobPayload;
};

export async function processNvdSyncJob(job: Job<JobData>) {
  const started = Date.now();
  const payload: NvdSyncJobPayload = {
    ...(job.data.payload ?? {}),
    requestedByUserId:
      job.data.payload?.requestedByUserId ?? job.data.requestedByUserId,
    requestedAt: job.data.payload?.requestedAt ?? job.data.requestedAt,
  };

  logger.info(
    { jobId: job.id, name: job.name, mode: payload.mode ?? "incremental" },
    "nvd-sync job started",
  );

  const result = await runNvdSync({ db, payload });

  logger.info(
    {
      jobId: job.id,
      durationMs: Date.now() - started,
      upserted: result.upserted,
      unchanged: result.unchanged,
      pages: result.pages,
    },
    "nvd-sync job completed",
  );

  return result;
}
