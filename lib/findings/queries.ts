import { and, count, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  assets,
  findings,
  scanJobs,
  vulnerabilities,
  type FindingStatus,
} from "@/db/schema";
import type { AppRole } from "@/lib/auth/roles";
import { serializeFindingListItem } from "./serialize";
import { assertFindingStatusTransition } from "./transitions";
import {
  FINDING_STATUSES,
  type FindingListItem,
  type FindingListResponse,
  type ListFindingsParams,
} from "./types";

export function parseFindingListParams(
  searchParams: URLSearchParams,
): ListFindingsParams {
  const q = searchParams.get("q")?.trim() || undefined;

  const statusRaw = searchParams.get("status")?.trim().toLowerCase();
  const status =
    statusRaw && (FINDING_STATUSES as string[]).includes(statusRaw)
      ? (statusRaw as FindingStatus)
      : undefined;

  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "25") || 25;
  const pageSize = Math.min(100, Math.max(1, pageSizeRaw));

  return { status, q, page, pageSize };
}

function buildSearchCondition(q: string | undefined): SQL | undefined {
  if (!q?.trim()) return undefined;
  const pattern = `%${q.trim()}%`;
  return or(
    ilike(findings.title, pattern),
    ilike(findings.cveId, pattern),
    ilike(findings.description, pattern),
    ilike(assets.hostname, pattern),
    ilike(assets.ip, pattern),
  );
}

export async function listFindings(
  params: ListFindingsParams,
): Promise<FindingListResponse> {
  const conditions: SQL[] = [];
  if (params.status) {
    conditions.push(eq(findings.status, params.status));
  }
  const search = buildSearchCondition(params.q);
  if (search) conditions.push(search);
  const where = conditions.length ? and(...conditions) : undefined;

  const [totalRow] = await db
    .select({ value: count() })
    .from(findings)
    .innerJoin(assets, eq(findings.assetId, assets.id))
    .where(where);

  const rows = await db
    .select({
      finding: findings,
      asset: assets,
      scanJob: scanJobs,
      vulnByFk: vulnerabilities.id,
    })
    .from(findings)
    .innerJoin(assets, eq(findings.assetId, assets.id))
    .leftJoin(scanJobs, eq(findings.scanJobId, scanJobs.id))
    .leftJoin(
      vulnerabilities,
      eq(findings.vulnerabilityId, vulnerabilities.id),
    )
    .where(where)
    .orderBy(desc(findings.createdAt))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);

  // Resolve CVE → vulnerability when FK is unset but cveId matches catalog.
  const unresolvedCves = [
    ...new Set(
      rows
        .filter((r) => !r.vulnByFk && r.finding.cveId)
        .map((r) => r.finding.cveId!.toUpperCase()),
    ),
  ];

  const cveToVulnId = new Map<string, string>();
  if (unresolvedCves.length > 0) {
    const matches = await db
      .select({ id: vulnerabilities.id, cveId: vulnerabilities.cveId })
      .from(vulnerabilities)
      .where(inArray(vulnerabilities.cveId, unresolvedCves));
    for (const match of matches) {
      if (match.cveId) {
        cveToVulnId.set(match.cveId.toUpperCase(), match.id);
      }
    }
  }

  const items: FindingListItem[] = rows.map((row) => {
    const vulnerabilityId =
      row.vulnByFk ??
      (row.finding.cveId
        ? (cveToVulnId.get(row.finding.cveId.toUpperCase()) ?? null)
        : null);
    return serializeFindingListItem(
      row.finding,
      row.asset,
      row.scanJob,
      vulnerabilityId,
    );
  });

  return {
    items,
    total: totalRow?.value ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getFindingById(
  id: string,
): Promise<FindingListItem | null> {
  const [row] = await db
    .select({
      finding: findings,
      asset: assets,
      scanJob: scanJobs,
      vulnByFk: vulnerabilities.id,
    })
    .from(findings)
    .innerJoin(assets, eq(findings.assetId, assets.id))
    .leftJoin(scanJobs, eq(findings.scanJobId, scanJobs.id))
    .leftJoin(
      vulnerabilities,
      eq(findings.vulnerabilityId, vulnerabilities.id),
    )
    .where(eq(findings.id, id))
    .limit(1);

  if (!row) return null;

  let vulnerabilityId = row.vulnByFk;
  if (!vulnerabilityId && row.finding.cveId) {
    const [match] = await db
      .select({ id: vulnerabilities.id })
      .from(vulnerabilities)
      .where(eq(vulnerabilities.cveId, row.finding.cveId.toUpperCase()))
      .limit(1);
    vulnerabilityId = match?.id ?? null;
  }

  return serializeFindingListItem(
    row.finding,
    row.asset,
    row.scanJob,
    vulnerabilityId,
  );
}

export async function updateFindingStatus(
  id: string,
  nextStatus: FindingStatus,
  role: AppRole,
): Promise<FindingListItem | null> {
  const [existing] = await db
    .select()
    .from(findings)
    .where(eq(findings.id, id))
    .limit(1);

  if (!existing) return null;

  assertFindingStatusTransition(existing.status, nextStatus, role);

  const [updated] = await db
    .update(findings)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(findings.id, id))
    .returning();

  if (!updated) return null;
  return getFindingById(updated.id);
}
