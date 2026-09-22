import { and, eq } from "drizzle-orm";
import {
  vulnerabilities,
  vulnerabilitySources,
  type NewVulnerability,
} from "@/db/schema";
import { db, type Db } from "@/lib/db/client";
import {
  bduExternalUrl,
  type ParsedBduVulnerability,
} from "@/lib/bdu/parse";

export type BduUpsertResult = {
  id: string;
  action: "inserted" | "updated" | "merged";
  bduId: string;
  cveId: string | null;
};

async function findByBdu(bduId: string, database: Db) {
  const [row] = await database
    .select()
    .from(vulnerabilities)
    .where(eq(vulnerabilities.bduId, bduId))
    .limit(1);
  return row ?? null;
}

async function findByCve(cveId: string, database: Db) {
  const [row] = await database
    .select()
    .from(vulnerabilities)
    .where(eq(vulnerabilities.cveId, cveId))
    .limit(1);
  return row ?? null;
}

async function upsertBduSource(
  vulnerabilityId: string,
  record: ParsedBduVulnerability,
  database: Db,
) {
  const [existing] = await database
    .select()
    .from(vulnerabilitySources)
    .where(
      and(
        eq(vulnerabilitySources.vulnerabilityId, vulnerabilityId),
        eq(vulnerabilitySources.source, "bdu"),
      ),
    )
    .limit(1);

  const payload = {
    rawXml: record.rawXml,
    externalUrl: bduExternalUrl(record.bduId),
    syncedAt: new Date(),
  };

  if (existing) {
    await database
      .update(vulnerabilitySources)
      .set(payload)
      .where(eq(vulnerabilitySources.id, existing.id));
    return;
  }

  await database.insert(vulnerabilitySources).values({
    vulnerabilityId,
    source: "bdu",
    ...payload,
  });
}

/**
 * When a BDU-only row and an NVD CVE row both exist, fold BDU into the CVE row.
 */
async function mergeBduIntoCve(
  bduRowId: string,
  cveRowId: string,
  database: Db,
) {
  // Move BDU source rows to CVE vulnerability
  const sources = await database
    .select()
    .from(vulnerabilitySources)
    .where(eq(vulnerabilitySources.vulnerabilityId, bduRowId));

  for (const src of sources) {
    const [dup] = await database
      .select()
      .from(vulnerabilitySources)
      .where(
        and(
          eq(vulnerabilitySources.vulnerabilityId, cveRowId),
          eq(vulnerabilitySources.source, src.source),
        ),
      )
      .limit(1);

    if (dup) {
      await database
        .update(vulnerabilitySources)
        .set({
          rawXml: src.rawXml ?? dup.rawXml,
          rawJson: src.rawJson ?? dup.rawJson,
          externalUrl: src.externalUrl ?? dup.externalUrl,
          syncedAt: new Date(),
        })
        .where(eq(vulnerabilitySources.id, dup.id));
      await database
        .delete(vulnerabilitySources)
        .where(eq(vulnerabilitySources.id, src.id));
    } else {
      await database
        .update(vulnerabilitySources)
        .set({ vulnerabilityId: cveRowId })
        .where(eq(vulnerabilitySources.id, src.id));
    }
  }

  await database.delete(vulnerabilities).where(eq(vulnerabilities.id, bduRowId));
}

export async function upsertBduVulnerability(
  record: ParsedBduVulnerability,
  database: Db = db,
): Promise<BduUpsertResult> {
  const byBdu = await findByBdu(record.bduId, database);
  const byCve = record.cveId ? await findByCve(record.cveId, database) : null;

  let action: BduUpsertResult["action"] = "inserted";
  let targetId: string;

  if (byBdu && byCve && byBdu.id !== byCve.id) {
    await mergeBduIntoCve(byBdu.id, byCve.id, database);
    targetId = byCve.id;
    action = "merged";
  } else if (byBdu) {
    targetId = byBdu.id;
    action = "updated";
  } else if (byCve) {
    targetId = byCve.id;
    action = "updated";
  } else {
    const values: NewVulnerability = {
      cveId: record.cveId,
      bduId: record.bduId,
      title: record.title,
      description: record.description,
      severity: record.severity,
      cvssScore: record.cvssScore,
    };
    const [inserted] = await database
      .insert(vulnerabilities)
      .values(values)
      .returning({ id: vulnerabilities.id });
    targetId = inserted.id;
    await upsertBduSource(targetId, record, database);
    return {
      id: targetId,
      action: "inserted",
      bduId: record.bduId,
      cveId: record.cveId,
    };
  }

  const [current] = await database
    .select()
    .from(vulnerabilities)
    .where(eq(vulnerabilities.id, targetId))
    .limit(1);

  await database
    .update(vulnerabilities)
    .set({
      bduId: record.bduId,
      cveId: record.cveId ?? current?.cveId ?? null,
      title: record.title || current?.title || record.bduId,
      description: record.description ?? current?.description ?? null,
      severity: record.severity !== "unknown" ? record.severity : (current?.severity ?? "unknown"),
      cvssScore: record.cvssScore ?? current?.cvssScore ?? null,
      updatedAt: new Date(),
    })
    .where(eq(vulnerabilities.id, targetId));

  await upsertBduSource(targetId, record, database);

  return {
    id: targetId,
    action,
    bduId: record.bduId,
    cveId: record.cveId ?? current?.cveId ?? null,
  };
}
