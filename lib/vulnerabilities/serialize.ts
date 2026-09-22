import type {
  Severity,
  Vulnerability,
  VulnerabilitySource,
  VulnSource,
} from "@/db/schema";
import type {
  VulnerabilityDetail,
  VulnerabilityListItem,
  VulnerabilitySourceDto,
} from "./types";

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toIsoRequired(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

export function parseCvssScore(
  value: string | number | null | undefined,
): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function serializeListItem(
  row: Vulnerability,
  sources: VulnSource[] = [],
): VulnerabilityListItem {
  return {
    id: row.id,
    cveId: row.cveId,
    bduId: row.bduId,
    title: row.title,
    description: row.description,
    severity: row.severity as Severity,
    cvssScore: parseCvssScore(row.cvssScore),
    publishedAt: toIso(row.publishedAt),
    modifiedAt: toIso(row.modifiedAt),
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
    sources,
  };
}

export function serializeSource(
  row: VulnerabilitySource,
): VulnerabilitySourceDto {
  return {
    id: row.id,
    source: row.source,
    externalUrl: row.externalUrl,
    syncedAt: toIsoRequired(row.syncedAt),
  };
}

export function serializeDetail(
  row: Vulnerability,
  sourceRows: VulnerabilitySource[],
): VulnerabilityDetail {
  const list = serializeListItem(
    row,
    sourceRows.map((s) => s.source),
  );
  return {
    ...list,
    sources: sourceRows.map(serializeSource),
  };
}
