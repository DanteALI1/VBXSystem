import { eq } from "drizzle-orm";
import { db } from "@/db";
import { scanJobs, type ScanJob } from "@/db/schema";
import { createQueue, QUEUE_NAMES } from "@/lib/queue";
import { getAdapter } from "./adapter";
import { assertTargetsAllowed, AllowlistRejectedError } from "./allowlist-gate";
import { NucleiTemplateDeniedError } from "./nuclei-policy";
import type { ScanType } from "./types";

export const SCAN_JOB_NAME = "scan-run";

export type EnqueueScanInput = {
  type: ScanType;
  targets: string[];
  options?: Record<string, unknown>;
  createdById?: string;
  /** When true, skip BullMQ (tests that drive ingest directly). */
  skipQueue?: boolean;
};

export type EnqueueScanResult =
  | {
      ok: true;
      job: ScanJob;
      queueJobId: string | null;
    }
  | {
      ok: false;
      code: string;
      message: string;
      rejected?: string[];
      job?: ScanJob;
    };

let scanQueue: ReturnType<typeof createQueue> | null = null;

export function getScanQueue() {
  if (!scanQueue) {
    scanQueue = createQueue(QUEUE_NAMES.scan);
  }
  return scanQueue;
}

/**
 * Create ScanJob + HTTP-enqueue to BullMQ.
 * Allowlist and nuclei template policy are enforced before queue add.
 * Never runs scanner binaries in-process here.
 */
export async function enqueueScanJob(
  input: EnqueueScanInput,
): Promise<EnqueueScanResult> {
  const targets = input.targets.map((t) => t.trim()).filter(Boolean);
  if (targets.length === 0) {
    return { ok: false, code: "BAD_REQUEST", message: "targets required" };
  }

  const adapter = getAdapter(input.type);
  const options = input.options ?? {};

  try {
    adapter.validateOptions?.(options);
  } catch (err) {
    if (err instanceof NucleiTemplateDeniedError) {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }

  try {
    await assertTargetsAllowed(targets);
  } catch (err) {
    if (err instanceof AllowlistRejectedError) {
      // Persist failed audit row without enqueueing a binary run
      const [failed] = await db
        .insert(scanJobs)
        .values({
          type: input.type,
          status: "failed",
          targets,
          options,
          errorMessage: err.code,
          createdById: input.createdById ?? null,
          finishedAt: new Date(),
        })
        .returning();
      return {
        ok: false,
        code: err.code,
        message: err.message,
        rejected: err.rejected,
        job: failed,
      };
    }
    throw err;
  }

  const [job] = await db
    .insert(scanJobs)
    .values({
      type: input.type,
      status: "queued",
      targets,
      options,
      createdById: input.createdById ?? null,
    })
    .returning();

  if (input.skipQueue) {
    return { ok: true, job, queueJobId: null };
  }

  const queue = getScanQueue();
  const bullJob = await queue.add(
    SCAN_JOB_NAME,
    {
      type: SCAN_JOB_NAME,
      scanJobId: job.id,
      requestedByUserId: input.createdById,
      requestedAt: new Date().toISOString(),
    },
    {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 2,
      backoff: { type: "exponential", delay: 5_000 },
    },
  );

  return { ok: true, job, queueJobId: String(bullJob.id) };
}

export async function getScanJob(id: string): Promise<ScanJob | null> {
  const [row] = await db
    .select()
    .from(scanJobs)
    .where(eq(scanJobs.id, id))
    .limit(1);
  return row ?? null;
}
