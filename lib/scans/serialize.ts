import type { ScanJob } from "@/db/schema";
import type { ScanListItem } from "./types";

function asOptions(
  value: unknown,
): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function serializeScanJob(row: ScanJob): ScanListItem {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    target: row.target,
    options: asOptions(row.optionsJson),
    error: row.error,
    createdBy: row.createdBy,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
