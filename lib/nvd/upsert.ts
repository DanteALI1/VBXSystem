import { and, eq } from "drizzle-orm";
import {
  vulnerabilities,
  vulnerabilitySources,
  type NewVulnerability,
} from "@/db/schema";
import { db, type Db } from "@/lib/db/client";
import type { MappedNvdVulnerability } from "@/lib/nvd/map";

export type NvdUpsertResult = {
  id: string;
  action: "inserted" | "updated";
  cveId: string;
};

export async function upsertNvdVulnerability(
  mapped: MappedNvdVulnerability,
  database: Db = db,
): Promise<NvdUpsertResult> {
  const [existing] = await database
    .select()
    .from(vulnerabilities)
    .where(eq(vulnerabilities.cveId, mapped.cveId))
    .limit(1);

  const values: NewVulnerability = {
    cveId: mapped.cveId,
    title: mapped.title,
    description: mapped.description,
    severity: mapped.severity,
    cvssScore: mapped.cvssScore,
    publishedAt: mapped.publishedAt,
    modifiedAt: mapped.modifiedAt,
  };

  let id: string;
  let action: "inserted" | "updated";

  if (existing) {
    const [updated] = await database
      .update(vulnerabilities)
      .set({
        ...values,
        bduId: existing.bduId,
        updatedAt: new Date(),
      })
      .where(eq(vulnerabilities.id, existing.id))
      .returning({ id: vulnerabilities.id });
    id = updated.id;
    action = "updated";
  } else {
    const [inserted] = await database
      .insert(vulnerabilities)
      .values(values)
      .returning({ id: vulnerabilities.id });
    id = inserted.id;
    action = "inserted";
  }

  const [sourceRow] = await database
    .select()
    .from(vulnerabilitySources)
    .where(
      and(
        eq(vulnerabilitySources.vulnerabilityId, id),
        eq(vulnerabilitySources.source, "nvd"),
      ),
    )
    .limit(1);

  if (sourceRow) {
    await database
      .update(vulnerabilitySources)
      .set({
        rawJson: mapped.rawJson,
        externalUrl: mapped.externalUrl,
        syncedAt: new Date(),
      })
      .where(eq(vulnerabilitySources.id, sourceRow.id));
  } else {
    await database.insert(vulnerabilitySources).values({
      vulnerabilityId: id,
      source: "nvd",
      rawJson: mapped.rawJson,
      externalUrl: mapped.externalUrl,
      syncedAt: new Date(),
    });
  }

  return { id, action, cveId: mapped.cveId };
}
