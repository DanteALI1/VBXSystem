import { and, eq, ne } from "drizzle-orm";
import type { Db } from "@/db";
import {
  vulnerabilities,
  vulnerabilityHistory,
  vulnerabilitySources,
} from "@/db/schema";
import {
  maxCvss,
  maxSeverity,
  severityFromCvss,
  type Severity,
} from "@/lib/domain/severity";
import type { ParsedNvdVulnerability } from "./types";

const TRACKED_FIELDS = [
  "title",
  "description",
  "severity",
  "cvssScore",
  "cvssVector",
  "cvssV2Score",
  "cvssV2Vector",
  "cvssV4Score",
  "cvssV4Vector",
  "epssScore",
  "kev",
  "vendors",
  "products",
  "cwes",
  "cpes",
  "references",
  "publishedAt",
  "updatedAt",
] as const;

type TrackedField = (typeof TRACKED_FIELDS)[number];

function numStr(v: number | null | undefined): string | null {
  if (v == null || Number.isNaN(v)) return null;
  return String(v);
}

function jsonStr(v: unknown): string {
  return JSON.stringify(v ?? null);
}

function snapshotField(
  field: TrackedField,
  row: {
    title: string;
    description: string;
    severity: Severity | null;
    cvssScore: string | null;
    cvssVector: string | null;
    cvssV2Score: string | null;
    cvssV2Vector: string | null;
    cvssV4Score: string | null;
    cvssV4Vector: string | null;
    epssScore: string | null;
    kev: boolean;
    vendors: string[];
    products: string[];
    cwes: string[];
    cpes: string[];
    references: unknown;
    publishedAt: Date | null;
    updatedAt: Date | null;
  },
): string | null {
  switch (field) {
    case "title":
      return row.title;
    case "description":
      return row.description;
    case "severity":
      return row.severity;
    case "cvssScore":
      return row.cvssScore;
    case "cvssVector":
      return row.cvssVector;
    case "cvssV2Score":
      return row.cvssV2Score;
    case "cvssV2Vector":
      return row.cvssV2Vector;
    case "cvssV4Score":
      return row.cvssV4Score;
    case "cvssV4Vector":
      return row.cvssV4Vector;
    case "epssScore":
      return row.epssScore;
    case "kev":
      return String(row.kev);
    case "vendors":
      return jsonStr(row.vendors);
    case "products":
      return jsonStr(row.products);
    case "cwes":
      return jsonStr(row.cwes);
    case "cpes":
      return jsonStr(row.cpes);
    case "references":
      return jsonStr(row.references);
    case "publishedAt":
      return row.publishedAt?.toISOString() ?? null;
    case "updatedAt":
      return row.updatedAt?.toISOString() ?? null;
    default:
      return null;
  }
}

export type UpsertNvdResult = {
  vulnerabilityId: string;
  created: boolean;
  changed: boolean;
};

/**
 * Idempotent upsert of one NVD CVE into Vulnerability + VulnerabilitySource(nvd).
 * Writes VulnerabilityHistory for changed tracked fields.
 * Top-level severity/cvss = max across existing sources + this NVD payload.
 */
export async function upsertNvdVulnerability(
  db: Db,
  parsed: ParsedNvdVulnerability,
  now: Date = new Date(),
): Promise<UpsertNvdResult> {
  const existing = await db.query.vulnerabilities.findFirst({
    where: eq(vulnerabilities.cveId, parsed.cveId),
  });

  const otherSources = existing
    ? await db
        .select({
          sourceCvssScore: vulnerabilitySources.sourceCvssScore,
          sourceSeverity: vulnerabilitySources.sourceSeverity,
        })
        .from(vulnerabilitySources)
        .where(
          and(
            eq(vulnerabilitySources.vulnerabilityId, existing.id),
            ne(vulnerabilitySources.source, "nvd"),
          ),
        )
    : [];

  let mergedCvss: number | null = parsed.cvssScore;
  let mergedSeverity: Severity | null = severityFromCvss(parsed.cvssScore);

  for (const s of otherSources) {
    const otherScore =
      s.sourceCvssScore != null ? Number(s.sourceCvssScore) : null;
    mergedCvss = maxCvss(mergedCvss, otherScore);
    const otherSev =
      (s.sourceSeverity as Severity | null) ?? severityFromCvss(otherScore);
    mergedSeverity = maxSeverity(mergedSeverity, otherSev);
  }

  // Prefer NVD v3 vector when NVD score wins or no other score
  const preferNvdVector =
    parsed.cvssScore != null &&
    (mergedCvss == null || mergedCvss === parsed.cvssScore);

  const next = {
    cveId: parsed.cveId,
    title: parsed.title,
    description: parsed.description,
    severity: mergedSeverity,
    cvssScore: numStr(mergedCvss),
    cvssVector: preferNvdVector
      ? parsed.cvssVector
      : (existing?.cvssVector ?? parsed.cvssVector),
    cvssV2Score: numStr(parsed.cvssV2Score),
    cvssV2Vector: parsed.cvssV2Vector,
    cvssV4Score: numStr(parsed.cvssV4Score),
    cvssV4Vector: parsed.cvssV4Vector,
    epssScore:
      parsed.epssScore != null
        ? String(parsed.epssScore)
        : (existing?.epssScore ?? null),
    kev: parsed.kev || Boolean(existing?.kev),
    vendors: parsed.vendors.length
      ? parsed.vendors
      : (existing?.vendors ?? []),
    products: parsed.products.length
      ? parsed.products
      : (existing?.products ?? []),
    cwes: parsed.cwes.length ? parsed.cwes : (existing?.cwes ?? []),
    cpes: parsed.cpes.length ? parsed.cpes : (existing?.cpes ?? []),
    references: parsed.references.length
      ? parsed.references
      : (existing?.references ?? []),
    affected: parsed.affected.length
      ? parsed.affected
      : (existing?.affected ?? []),
    publishedAt: parsed.publishedAt ?? existing?.publishedAt ?? null,
    updatedAt: parsed.updatedAt ?? existing?.updatedAt ?? null,
    localSyncedAt: now,
  };

  if (!existing) {
    const [inserted] = await db
      .insert(vulnerabilities)
      .values({
        ...next,
        createdAt: now,
      })
      .returning({ id: vulnerabilities.id });

    await db.insert(vulnerabilitySources).values({
      vulnerabilityId: inserted.id,
      source: "nvd",
      rawPayload: parsed.raw,
      syncedAt: now,
      sourceSeverity: parsed.sourceSeverity,
      sourceCvssScore: numStr(parsed.cvssScore),
    });

    await db.insert(vulnerabilityHistory).values([
      {
        vulnerabilityId: inserted.id,
        at: now,
        field: "source_sync",
        oldValue: null,
        newValue: "created",
        source: "nvd",
      },
      {
        vulnerabilityId: inserted.id,
        at: now,
        field: "severity",
        oldValue: null,
        newValue: next.severity,
        source: "nvd",
      },
    ]);

    return { vulnerabilityId: inserted.id, created: true, changed: true };
  }

  const before = {
    title: existing.title,
    description: existing.description,
    severity: existing.severity,
    cvssScore: existing.cvssScore,
    cvssVector: existing.cvssVector,
    cvssV2Score: existing.cvssV2Score,
    cvssV2Vector: existing.cvssV2Vector,
    cvssV4Score: existing.cvssV4Score,
    cvssV4Vector: existing.cvssV4Vector,
    epssScore: existing.epssScore,
    kev: existing.kev,
    vendors: existing.vendors ?? [],
    products: existing.products ?? [],
    cwes: existing.cwes ?? [],
    cpes: existing.cpes ?? [],
    references: existing.references ?? [],
    publishedAt: existing.publishedAt,
    updatedAt: existing.updatedAt,
  };

  const after = {
    title: next.title,
    description: next.description,
    severity: next.severity,
    cvssScore: next.cvssScore,
    cvssVector: next.cvssVector,
    cvssV2Score: next.cvssV2Score,
    cvssV2Vector: next.cvssV2Vector,
    cvssV4Score: next.cvssV4Score,
    cvssV4Vector: next.cvssV4Vector,
    epssScore: next.epssScore,
    kev: next.kev,
    vendors: next.vendors,
    products: next.products,
    cwes: next.cwes,
    cpes: next.cpes,
    references: next.references,
    publishedAt: next.publishedAt,
    updatedAt: next.updatedAt,
  };

  const changes: {
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }[] = [];

  for (const field of TRACKED_FIELDS) {
    const oldValue = snapshotField(field, before);
    const newValue = snapshotField(field, after);
    if (oldValue !== newValue) {
      changes.push({ field, oldValue, newValue });
    }
  }

  await db
    .update(vulnerabilities)
    .set(next)
    .where(eq(vulnerabilities.id, existing.id));

  const existingSource = await db.query.vulnerabilitySources.findFirst({
    where: and(
      eq(vulnerabilitySources.vulnerabilityId, existing.id),
      eq(vulnerabilitySources.source, "nvd"),
    ),
  });

  if (existingSource) {
    await db
      .update(vulnerabilitySources)
      .set({
        rawPayload: parsed.raw,
        syncedAt: now,
        sourceSeverity: parsed.sourceSeverity,
        sourceCvssScore: numStr(parsed.cvssScore),
      })
      .where(eq(vulnerabilitySources.id, existingSource.id));
  } else {
    await db.insert(vulnerabilitySources).values({
      vulnerabilityId: existing.id,
      source: "nvd",
      rawPayload: parsed.raw,
      syncedAt: now,
      sourceSeverity: parsed.sourceSeverity,
      sourceCvssScore: numStr(parsed.cvssScore),
    });
  }

  if (changes.length > 0) {
    await db.insert(vulnerabilityHistory).values([
      {
        vulnerabilityId: existing.id,
        at: now,
        field: "source_sync",
        oldValue: "updated",
        newValue: `nvd:${changes.map((c) => c.field).join(",")}`,
        source: "nvd",
      },
      ...changes.map((c) => ({
        vulnerabilityId: existing.id,
        at: now,
        field: c.field,
        oldValue: c.oldValue,
        newValue: c.newValue,
        source: "nvd" as const,
      })),
    ]);
  }

  return {
    vulnerabilityId: existing.id,
    created: false,
    changed: changes.length > 0,
  };
}
