import { count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  assets,
  findings,
  syncStates,
  vulnerabilities,
  type SyncState,
  type VulnSource,
} from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import type { DashboardData, DashboardSyncState } from "@/lib/queries/dashboard";

function serializeSync(row: SyncState): DashboardSyncState {
  return {
    source: row.source,
    status: row.status,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    cursor: row.cursor,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [[vulnRow], [assetRow], [openRow], syncRows] = await Promise.all([
    db.select({ value: count() }).from(vulnerabilities),
    db.select({ value: count() }).from(assets),
    db
      .select({ value: count() })
      .from(findings)
      .where(eq(findings.status, "open")),
    db.select().from(syncStates),
  ]);

  const sync: DashboardData["sync"] = {};
  for (const row of syncRows) {
    const key = row.source as VulnSource;
    if (key === "nvd" || key === "bdu") {
      sync[key] = serializeSync(row);
    }
  }

  const body: DashboardData = {
    vulnerabilities: Number(vulnRow?.value ?? 0),
    assets: Number(assetRow?.value ?? 0),
    findingsOpen: Number(openRow?.value ?? 0),
    sync,
  };

  return NextResponse.json(body);
}
