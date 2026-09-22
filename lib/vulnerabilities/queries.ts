import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  vulnerabilities,
  vulnerabilitySources,
  type Severity,
  type VulnSource,
} from "@/db/schema";
import { serializeDetail, serializeListItem } from "./serialize";
import type {
  ListVulnerabilitiesParams,
  VulnerabilityDetail,
  VulnerabilityListItem,
  VulnerabilityListResponse,
} from "./types";
import { SEVERITIES, VULN_SOURCES } from "./types";

function buildSearchCondition(q: string | undefined): SQL | undefined {
  if (!q?.trim()) return undefined;
  const pattern = `%${q.trim()}%`;
  return or(
    ilike(vulnerabilities.title, pattern),
    ilike(vulnerabilities.cveId, pattern),
    ilike(vulnerabilities.bduId, pattern),
  );
}

function buildSeverityCondition(
  severities: Severity[] | undefined,
): SQL | undefined {
  if (!severities?.length) return undefined;
  return inArray(vulnerabilities.severity, severities);
}

export function parseListParams(
  searchParams: URLSearchParams,
): ListVulnerabilitiesParams {
  const q = searchParams.get("q")?.trim() || undefined;

  const severityRaw = searchParams
    .getAll("severity")
    .flatMap((v) => v.split(","))
    .map((v) => v.trim().toLowerCase())
    .filter((v): v is Severity => (SEVERITIES as string[]).includes(v));

  // Deduplicate while preserving order
  const severity = [...new Set(severityRaw)];

  const sourceRaw = searchParams.get("source")?.trim().toLowerCase();
  const source =
    sourceRaw && (VULN_SOURCES as string[]).includes(sourceRaw)
      ? (sourceRaw as VulnSource)
      : undefined;

  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "25") || 25;
  const pageSize = Math.min(100, Math.max(1, pageSizeRaw));

  return { q, severity: severity.length ? severity : undefined, source, page, pageSize };
}

export async function listVulnerabilities(
  params: ListVulnerabilitiesParams,
): Promise<VulnerabilityListResponse> {
  const conditions: SQL[] = [];
  const search = buildSearchCondition(params.q);
  if (search) conditions.push(search);
  const severity = buildSeverityCondition(params.severity);
  if (severity) conditions.push(severity);

  if (params.source) {
    conditions.push(
      sql`exists (
        select 1 from ${vulnerabilitySources} vs
        where vs.vulnerability_id = ${vulnerabilities.id}
          and vs.source = ${params.source}
      )`,
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const offset = (params.page - 1) * params.pageSize;

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(vulnerabilities)
      .where(where)
      .orderBy(desc(vulnerabilities.publishedAt), desc(vulnerabilities.createdAt))
      .limit(params.pageSize)
      .offset(offset),
    db.select({ value: count() }).from(vulnerabilities).where(where),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const ids = rows.map((r) => r.id);

  const sourceRows =
    ids.length === 0
      ? []
      : await db
          .select({
            vulnerabilityId: vulnerabilitySources.vulnerabilityId,
            source: vulnerabilitySources.source,
          })
          .from(vulnerabilitySources)
          .where(inArray(vulnerabilitySources.vulnerabilityId, ids));

  const sourcesByVuln = new Map<string, VulnSource[]>();
  for (const s of sourceRows) {
    const list = sourcesByVuln.get(s.vulnerabilityId) ?? [];
    if (!list.includes(s.source)) list.push(s.source);
    sourcesByVuln.set(s.vulnerabilityId, list);
  }

  const items: VulnerabilityListItem[] = rows.map((row) =>
    serializeListItem(row, sourcesByVuln.get(row.id) ?? []),
  );

  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getVulnerabilityById(
  id: string,
): Promise<VulnerabilityDetail | null> {
  const [row] = await db
    .select()
    .from(vulnerabilities)
    .where(eq(vulnerabilities.id, id))
    .limit(1);

  if (!row) return null;

  const sourceRows = await db
    .select()
    .from(vulnerabilitySources)
    .where(eq(vulnerabilitySources.vulnerabilityId, id));

  return serializeDetail(row, sourceRows);
}
