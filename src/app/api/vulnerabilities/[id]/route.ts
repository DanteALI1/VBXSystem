import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  findings,
  vulnerabilities,
  vulnerabilityHistory,
  vulnerabilitySources,
  vulnerabilityTagLinks,
  vulnerabilityTags,
} from "@/db/schema";
import { apiError } from "@/lib/search/api-error";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const [row] = await db.select().from(vulnerabilities).where(eq(vulnerabilities.id, id)).limit(1);
  if (!row) return apiError(404, "NOT_FOUND", "Vulnerability not found");

  const sources = await db.select().from(vulnerabilitySources).where(eq(vulnerabilitySources.vulnerabilityId, id));
  const history = await db.select().from(vulnerabilityHistory).where(eq(vulnerabilityHistory.vulnerabilityId, id)).orderBy(asc(vulnerabilityHistory.at));
  const tagRows = await db
    .select({ id: vulnerabilityTags.id, name: vulnerabilityTags.name, color: vulnerabilityTags.color })
    .from(vulnerabilityTagLinks)
    .innerJoin(vulnerabilityTags, eq(vulnerabilityTags.id, vulnerabilityTagLinks.tagId))
    .where(eq(vulnerabilityTagLinks.vulnerabilityId, id));
  const relatedFindings = await db
    .select({ id: findings.id, title: findings.title, status: findings.status, severity: findings.severity })
    .from(findings)
    .where(eq(findings.vulnerabilityId, id))
    .limit(20);

  const nvd = sources.find((s) => s.source === "nvd");
  const bdu = sources.find((s) => s.source === "bdu");
  const descriptions: { source: "nvd" | "bdu"; text: string }[] = [];
  if (nvd?.rawPayload && typeof nvd.rawPayload === "object") {
    const payload = nvd.rawPayload as { cve?: { descriptions?: { lang: string; value: string }[] }; description?: string };
    const en = payload.cve?.descriptions?.find((d) => d.lang === "en");
    if (en?.value) descriptions.push({ source: "nvd", text: en.value });
    else if (typeof (nvd.rawPayload as { description?: string }).description === "string") {
      /* ignore */
    }
  }
  if (bdu?.rawPayload && typeof bdu.rawPayload === "object") {
    const payload = bdu.rawPayload as { description?: string };
    if (payload.description) descriptions.push({ source: "bdu", text: payload.description });
  }
  if (descriptions.length === 0 && row.description) {
    descriptions.push({ source: nvd ? "nvd" : "bdu", text: row.description });
  }

  return NextResponse.json({
    id: row.id,
    cveId: row.cveId,
    bduId: row.bduId,
    title: row.title,
    description: row.description,
    descriptions,
    severity: row.severity,
    cvssScore: row.cvssScore != null ? Number(row.cvssScore) : null,
    cvssVector: row.cvssVector,
    cvssV2Score: row.cvssV2Score != null ? Number(row.cvssV2Score) : null,
    cvssV2Vector: row.cvssV2Vector,
    cvssV4Score: row.cvssV4Score != null ? Number(row.cvssV4Score) : null,
    cvssV4Vector: row.cvssV4Vector,
    epssScore: row.epssScore != null ? Number(row.epssScore) : null,
    kev: row.kev,
    vendors: row.vendors ?? [],
    products: row.products ?? [],
    cwes: row.cwes ?? [],
    cpes: row.cpes ?? [],
    references: row.references ?? [],
    affected: row.affected ?? [],
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    localSyncedAt: row.localSyncedAt,
    createdAt: row.createdAt,
    analystNotes: row.analystNotes,
    sources: sources.map((s) => ({
      id: s.id,
      source: s.source,
      syncedAt: s.syncedAt,
      sourceSeverity: s.sourceSeverity,
      sourceCvssScore: s.sourceCvssScore != null ? Number(s.sourceCvssScore) : null,
      rawPayload: s.rawPayload,
    })),
    tags: tagRows,
    history: history.map((h) => ({
      id: h.id, at: h.at, field: h.field, oldValue: h.oldValue, newValue: h.newValue, source: h.source,
    })),
    relatedFindings,
    linkedIds: { cveId: row.cveId, bduId: row.bduId },
  });
}
