import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { accessSync, constants } from "node:fs";
import { db } from "@/lib/db/client";
import { findings, scanJobs, type ScanStatus, type ScanType } from "@/db/schema";
import { listEnabledAllowlistRules } from "@/lib/allowlist/queries";
import { isTargetAllowed } from "@/lib/domain/allowlist";
import { enqueueScanJob } from "@/lib/sync/queues";
import {
  getScannerAdapter,
  persistFindingDrafts,
  reportDirForJob,
} from "@/lib/scanners";
import { serializeScanJob } from "./serialize";
import type { CreateScanInput } from "./schemas";
import type {
  ListScansParams,
  ScanDetail,
  ScanListItem,
  ScanListResponse,
} from "./types";

export class ScanAllowlistError extends Error {
  readonly status = 400;

  constructor(target: string) {
    super(
      `Target "${target}" is not allowed by the enabled scan allowlist. Add or enable a matching CIDR/URL rule before creating a scan.`,
    );
    this.name = "ScanAllowlistError";
  }
}

export function parseScanListParams(
  searchParams: URLSearchParams,
): ListScansParams {
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "25") || 25;
  const pageSize = Math.min(100, Math.max(1, pageSizeRaw));
  const type = searchParams.get("type") as ScanType | null;
  const status = searchParams.get("status") as ScanStatus | null;
  const validTypes = new Set(["nmap", "nuclei", "zap", "openvas"]);
  const validStatuses = new Set(["queued", "running", "succeeded", "failed"]);
  return {
    page,
    pageSize,
    type: type && validTypes.has(type) ? type : undefined,
    status: status && validStatuses.has(status) ? status : undefined,
  };
}

export async function listScans(
  params: ListScansParams,
): Promise<ScanListResponse> {
  const conditions: SQL[] = [];
  if (params.type) conditions.push(eq(scanJobs.type, params.type));
  if (params.status) conditions.push(eq(scanJobs.status, params.status));
  const where = conditions.length ? and(...conditions) : undefined;

  const [totalRow] = await db
    .select({ value: count() })
    .from(scanJobs)
    .where(where);

  const rows = await db
    .select()
    .from(scanJobs)
    .where(where)
    .orderBy(desc(scanJobs.createdAt))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);

  return {
    items: rows.map(serializeScanJob),
    total: totalRow?.value ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getScanById(id: string): Promise<ScanDetail | null> {
  const [row] = await db
    .select()
    .from(scanJobs)
    .where(eq(scanJobs.id, id))
    .limit(1);
  if (!row) return null;

  const [findingsRow] = await db
    .select({ value: count() })
    .from(findings)
    .where(eq(findings.scanJobId, id));

  const reportDir = reportDirForJob(id);
  let reportDirExists: string | null = null;
  try {
    accessSync(reportDir, constants.R_OK);
    reportDirExists = reportDir;
  } catch {
    reportDirExists = null;
  }

  return {
    ...serializeScanJob(row),
    findingsCount: findingsRow?.value ?? 0,
    reportDir: reportDirExists,
  };
}

export async function assertTargetAllowed(target: string): Promise<void> {
  const rules = await listEnabledAllowlistRules();
  if (!isTargetAllowed(target, rules)) {
    throw new ScanAllowlistError(target);
  }
}

/**
 * Create a scan_jobs row (queued) and enqueue BullMQ scan job.
 * Allowlist is enforced before insert/enqueue.
 */
export async function createAndEnqueueScan(
  input: CreateScanInput,
  createdBy: string | null,
): Promise<ScanListItem> {
  await assertTargetAllowed(input.target);

  const [row] = await db
    .insert(scanJobs)
    .values({
      type: input.type,
      status: "queued",
      target: input.target,
      optionsJson: input.options ?? {},
      createdBy,
    })
    .returning();

  try {
    await enqueueScanJob({ scanJobId: row.id });
  } catch (err) {
    await db
      .update(scanJobs)
      .set({
        status: "failed",
        error: err instanceof Error ? err.message : "Failed to enqueue scan",
        finishedAt: new Date(),
      })
      .where(eq(scanJobs.id, row.id));
    throw err;
  }

  return serializeScanJob(row);
}

export type RunScanJobResult = {
  scanJobId: string;
  status: "succeeded" | "failed";
  findingsCreated: number;
  servicesUpserted: number;
  fixture: boolean;
  error?: string;
};

/** Worker entry: run adapter → persist report/findings → update status. */
export async function runScanJob(scanJobId: string): Promise<RunScanJobResult> {
  const [job] = await db
    .select()
    .from(scanJobs)
    .where(eq(scanJobs.id, scanJobId))
    .limit(1);

  if (!job) {
    throw new Error(`scan job not found: ${scanJobId}`);
  }

  // Defense-in-depth allowlist check
  try {
    await assertTargetAllowed(job.target);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Target not in allowlist";
    await db
      .update(scanJobs)
      .set({
        status: "failed",
        error: message,
        startedAt: new Date(),
        finishedAt: new Date(),
      })
      .where(eq(scanJobs.id, scanJobId));
    return {
      scanJobId,
      status: "failed",
      findingsCreated: 0,
      servicesUpserted: 0,
      fixture: false,
      error: message,
    };
  }

  await db
    .update(scanJobs)
    .set({
      status: "running",
      startedAt: new Date(),
      error: null,
    })
    .where(eq(scanJobs.id, scanJobId));

  const options =
    job.optionsJson &&
    typeof job.optionsJson === "object" &&
    !Array.isArray(job.optionsJson)
      ? (job.optionsJson as Record<string, unknown>)
      : {};

  const adapter = getScannerAdapter(job.type);
  const reportDir = reportDirForJob(job.id);

  try {
    const report = await adapter.start({ job, reportDir, options });
    const drafts = await adapter.parse(report);
    const persisted = await persistFindingDrafts({
      drafts,
      scanJobId: job.id,
      target: job.target,
    });

    await db
      .update(scanJobs)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        error: null,
      })
      .where(eq(scanJobs.id, scanJobId));

    return {
      scanJobId,
      status: "succeeded",
      findingsCreated: persisted.findingsCreated,
      servicesUpserted: persisted.servicesUpserted,
      fixture: report.fixture,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(scanJobs)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: message,
      })
      .where(eq(scanJobs.id, scanJobId));

    return {
      scanJobId,
      status: "failed",
      findingsCreated: 0,
      servicesUpserted: 0,
      fixture: false,
      error: message,
    };
  }
}
