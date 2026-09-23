import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import {
  vulnerabilities,
  vulnerabilityHistory,
  vulnerabilitySources,
} from "@/db/schema";
import { maxCvss, maxSeverity, type Severity } from "@/lib/domain/severity";
import type { BduUpsertStats, ParsedBduRecord } from "./types";

type VulnRow = typeof vulnerabilities.$inferSelect;

function scoreToDb(score: number | null): string | null {
  if (score == null || Number.isNaN(score)) return null;
  return String(score);
}

function strEq(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

async function findByBduId(db: Db, bduId: string): Promise<VulnRow | null> {
  const [row] = await db
    .select()
    .from(vulnerabilities)
    .where(eq(vulnerabilities.bduId, bduId))
    .limit(1);
  return row ?? null;
}

async function findByCveId(db: Db, cveId: string): Promise<VulnRow | null> {
  const [row] = await db
    .select()
    .from(vulnerabilities)
    .where(eq(vulnerabilities.cveId, cveId))
    .limit(1);
  return row ?? null;
}

async function writeHistory(
  db: Db,
  vulnerabilityId: string,
  field: string,
  oldValue: string | null,
  newValue: string | null,
  at: Date,
): Promise<boolean> {
  if (strEq(oldValue, newValue)) return false;
  await db.insert(vulnerabilityHistory).values({
    vulnerabilityId,
    at,
    field,
    oldValue,
    newValue,
    source: "bdu",
  });
  return true;
}

async function upsertSource(
  db: Db,
  vulnerabilityId: string,
  record: ParsedBduRecord,
  at: Date,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(vulnerabilitySources)
    .where(
      and(
        eq(vulnerabilitySources.vulnerabilityId, vulnerabilityId),
        eq(vulnerabilitySources.source, "bdu"),
      ),
    )
    .limit(1);

  const values = {
    vulnerabilityId,
    source: "bdu" as const,
    rawPayload: record.raw as Record<string, unknown>,
    syncedAt: at,
    sourceSeverity: record.severity,
    sourceCvssScore: scoreToDb(record.cvssScore),
  };

  if (existing) {
    await db
      .update(vulnerabilitySources)
      .set(values)
      .where(eq(vulnerabilitySources.id, existing.id));
  } else {
    await db.insert(vulnerabilitySources).values(values);
  }
}

/**
 * When a BDU-only row and an NVD CVE row both exist, merge onto the CVE row
 * so we never create two cards with the same cveId.
 */
async function mergeOntoCveRow(
  db: Db,
  cveRow: VulnRow,
  bduRow: VulnRow,
  at: Date,
): Promise<{ targetId: string; history: number }> {
  let history = 0;
  if (
    await writeHistory(
      db,
      cveRow.id,
      "bduId",
      cveRow.bduId,
      bduRow.bduId,
      at,
    )
  ) {
    history += 1;
  }

  // Clear unique bduId on donor before attaching to CVE row
  await db
    .update(vulnerabilities)
    .set({ bduId: null })
    .where(eq(vulnerabilities.id, bduRow.id));

  await db
    .update(vulnerabilities)
    .set({
      bduId: bduRow.bduId,
      localSyncedAt: at,
      title: cveRow.title || bduRow.title,
      description:
        cveRow.description && bduRow.description
          ? cveRow.description.includes(bduRow.description)
            ? cveRow.description
            : `${cveRow.description}\n\n[BDU] ${bduRow.description}`
          : cveRow.description || bduRow.description,
      severity: maxSeverity(
        cveRow.severity as Severity | null,
        bduRow.severity as Severity | null,
      ),
      cvssScore: scoreToDb(
        maxCvss(
          cveRow.cvssScore != null ? Number(cveRow.cvssScore) : null,
          bduRow.cvssScore != null ? Number(bduRow.cvssScore) : null,
        ),
      ),
      vendors: [
        ...new Set([
          ...((cveRow.vendors as string[]) ?? []),
          ...((bduRow.vendors as string[]) ?? []),
        ]),
      ],
      products: [
        ...new Set([
          ...((cveRow.products as string[]) ?? []),
          ...((bduRow.products as string[]) ?? []),
        ]),
      ],
    })
    .where(eq(vulnerabilities.id, cveRow.id));

  // Re-point BDU source rows to CVE card
  await db
    .update(vulnerabilitySources)
    .set({ vulnerabilityId: cveRow.id })
    .where(
      and(
        eq(vulnerabilitySources.vulnerabilityId, bduRow.id),
        eq(vulnerabilitySources.source, "bdu"),
      ),
    );

  await db.delete(vulnerabilities).where(eq(vulnerabilities.id, bduRow.id));
  return { targetId: cveRow.id, history };
}

async function applyRecord(
  db: Db,
  record: ParsedBduRecord,
  at: Date,
): Promise<{
  created: boolean;
  updated: boolean;
  linked: boolean;
  historyEntries: number;
}> {
  let byBdu = await findByBduId(db, record.bduId);
  let byCve = record.cveId ? await findByCveId(db, record.cveId) : null;
  let historyEntries = 0;
  let linked = false;
  let created = false;
  let updated = false;

  if (byBdu && byCve && byBdu.id !== byCve.id) {
    const merged = await mergeOntoCveRow(db, byCve, byBdu, at);
    historyEntries += merged.history;
    byBdu = await findByBduId(db, record.bduId);
    byCve = record.cveId ? await findByCveId(db, record.cveId) : null;
    linked = true;
  }

  const existing = byBdu ?? byCve ?? null;

  const nextSeverity = maxSeverity(
    existing?.severity as Severity | null,
    record.severity,
  );
  const nextCvss = maxCvss(
    existing?.cvssScore != null ? Number(existing.cvssScore) : null,
    record.cvssScore,
  );
  const nextVendors = [
    ...new Set([
      ...((existing?.vendors as string[]) ?? []),
      ...record.vendors,
    ]),
  ];
  const nextProducts = [
    ...new Set([
      ...((existing?.products as string[]) ?? []),
      ...record.products,
    ]),
  ];

  const values = {
    bduId: record.bduId,
    cveId: record.cveId ?? existing?.cveId ?? null,
    title: record.title || existing?.title || record.bduId,
    description: record.description || existing?.description || "",
    severity: nextSeverity,
    cvssScore: scoreToDb(nextCvss),
    cvssVector: record.cvssVector ?? existing?.cvssVector ?? null,
    vendors: nextVendors,
    products: nextProducts,
    affected:
      record.affected.length > 0
        ? record.affected
        : ((existing?.affected as ParsedBduRecord["affected"]) ?? []),
    localSyncedAt: at,
    updatedAt: at,
  };

  // Ensure we don't violate unique cveId when attaching
  if (
    values.cveId &&
    existing &&
    existing.cveId !== values.cveId
  ) {
    const conflict = await findByCveId(db, values.cveId);
    if (conflict && conflict.id !== existing.id) {
      const merged = await mergeOntoCveRow(db, conflict, existing, at);
      historyEntries += merged.history;
      linked = true;
      await upsertSource(db, merged.targetId, record, at);
      return { created: false, updated: true, linked, historyEntries };
    }
  }

  let vulnId: string;
  if (existing) {
    if (
      await writeHistory(
        db,
        existing.id,
        "bduId",
        existing.bduId,
        values.bduId,
        at,
      )
    ) {
      historyEntries += 1;
      if (!existing.bduId && values.bduId) linked = true;
    }
    if (
      await writeHistory(
        db,
        existing.id,
        "cveId",
        existing.cveId,
        values.cveId,
        at,
      )
    ) {
      historyEntries += 1;
      if (!existing.cveId && values.cveId) linked = true;
    }
    if (
      await writeHistory(
        db,
        existing.id,
        "title",
        existing.title,
        values.title,
        at,
      )
    ) {
      historyEntries += 1;
    }
    if (
      await writeHistory(
        db,
        existing.id,
        "description",
        existing.description,
        values.description,
        at,
      )
    ) {
      historyEntries += 1;
    }
    if (
      await writeHistory(
        db,
        existing.id,
        "severity",
        existing.severity,
        values.severity,
        at,
      )
    ) {
      historyEntries += 1;
    }
    if (
      await writeHistory(
        db,
        existing.id,
        "cvssScore",
        existing.cvssScore != null ? String(existing.cvssScore) : null,
        values.cvssScore,
        at,
      )
    ) {
      historyEntries += 1;
    }

    await db
      .update(vulnerabilities)
      .set(values)
      .where(eq(vulnerabilities.id, existing.id));
    vulnId = existing.id;
    updated = true;
    if (record.cveId && existing.cveId === record.cveId && existing.bduId !== record.bduId) {
      linked = true;
    }
    if (record.cveId && !existing.cveId) linked = true;
    if (!existing.bduId && byCve) linked = true;
  } else {
    const [createdRow] = await db
      .insert(vulnerabilities)
      .values(values)
      .returning({ id: vulnerabilities.id });
    vulnId = createdRow.id;
    created = true;
    if (record.cveId) linked = true;
    historyEntries += Number(
      await writeHistory(db, vulnId, "bduId", null, record.bduId, at),
    );
    if (record.cveId) {
      historyEntries += Number(
        await writeHistory(db, vulnId, "cveId", null, record.cveId, at),
      );
    }
  }

  await upsertSource(db, vulnId, record, at);
  return { created, updated, linked, historyEntries };
}

export async function upsertBduRecords(
  db: Db,
  records: ParsedBduRecord[],
): Promise<BduUpsertStats> {
  const stats: BduUpsertStats = {
    upserted: 0,
    created: 0,
    updated: 0,
    linked: 0,
    skipped: 0,
    historyEntries: 0,
  };
  const at = new Date();

  for (const record of records) {
    try {
      const result = await applyRecord(db, record, at);
      stats.upserted += 1;
      if (result.created) stats.created += 1;
      if (result.updated) stats.updated += 1;
      if (result.linked) stats.linked += 1;
      stats.historyEntries += result.historyEntries;
    } catch (err) {
      stats.skipped += 1;
      // Keep going — one bad row must not abort the job
      console.warn(
        "[bdu upsert] skipped",
        record.bduId,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return stats;
}

/** Test/helper: ensure no duplicate cveId rows exist after sync. */
export async function countVulnsByCve(db: Db, cveId: string): Promise<number> {
  const rows = await db
    .select({ id: vulnerabilities.id })
    .from(vulnerabilities)
    .where(eq(vulnerabilities.cveId, cveId));
  return rows.length;
}
