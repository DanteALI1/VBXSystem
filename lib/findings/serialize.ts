import type { Asset, Finding, ScanJob } from "@/db/schema";
import type { FindingListItem } from "./types";

export function serializeFindingListItem(
  row: Finding,
  asset: Asset,
  scanJob: ScanJob | null,
  vulnerabilityId: string | null,
): FindingListItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    cveId: row.cveId,
    vulnerabilityId,
    asset: {
      id: asset.id,
      hostname: asset.hostname,
      ip: asset.ip,
    },
    scanJob: scanJob
      ? {
          id: scanJob.id,
          type: scanJob.type,
          status: scanJob.status,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
