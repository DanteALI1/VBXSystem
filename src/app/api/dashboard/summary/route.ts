import { NextResponse } from "next/server";
import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  assets,
  findings,
  syncState,
  vulnerabilities,
} from "@/db/schema";

export async function GET() {
  const [vulnTotal] = await db.select({ c: count() }).from(vulnerabilities);
  const [critical] = await db
    .select({ c: count() })
    .from(vulnerabilities)
    .where(eq(vulnerabilities.severity, "critical"));
  const [high] = await db
    .select({ c: count() })
    .from(vulnerabilities)
    .where(eq(vulnerabilities.severity, "high"));
  const [openFindings] = await db
    .select({ c: count() })
    .from(findings)
    .where(eq(findings.status, "open"));
  const [assetTotal] = await db.select({ c: count() }).from(assets);

  const syncs = await db.select().from(syncState);
  const nvd = syncs.find((s) => s.source === "nvd");
  const bdu = syncs.find((s) => s.source === "bdu");

  const recent = await db
    .select({
      id: vulnerabilities.id,
      cveId: vulnerabilities.cveId,
      bduId: vulnerabilities.bduId,
      title: vulnerabilities.title,
      severity: vulnerabilities.severity,
      localSyncedAt: vulnerabilities.localSyncedAt,
    })
    .from(vulnerabilities)
    .orderBy(sql`${vulnerabilities.localSyncedAt} desc nulls last`)
    .limit(8);

  return NextResponse.json({
    vulnerabilitiesTotal: vulnTotal.c,
    critical: critical.c,
    high: high.c,
    findingsOpen: openFindings.c,
    assets: assetTotal.c,
    lastNvdSync: nvd?.lastSuccessAt ?? null,
    lastBduSync: bdu?.lastSuccessAt ?? null,
    recent,
  });
}
