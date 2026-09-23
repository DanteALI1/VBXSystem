/**
 * Optional seed helper: insert sample findings for UI demos / TC-016.
 * Safe to call multiple times (idempotent by title+cve fingerprint when possible).
 */
import { eq } from "drizzle-orm";
import type { db as DbType } from "@/db";
import { assets, findings, vulnerabilities } from "@/db/schema";

type Db = typeof DbType;

export type SampleFindingSeed = {
  title: string;
  status?: "open" | "fixed" | "accepted" | "false_positive";
  severity?: "none" | "low" | "medium" | "high" | "critical" | null;
  cveId?: string | null;
  bduId?: string | null;
  assetName?: string;
};

const DEFAULT_SAMPLES: SampleFindingSeed[] = [
  {
    title: "Nuclei: outdated OpenSSL banner",
    status: "open",
    severity: "high",
    cveId: "CVE-2024-0001",
    assetName: "lab-web-1",
  },
  {
    title: "Nmap: exposed Redis without auth",
    status: "open",
    severity: "critical",
    bduId: "BDU:2024-0001",
    assetName: "lab-db-1",
  },
  {
    title: "Accepted risk: management UI on VPN",
    status: "accepted",
    severity: "medium",
    assetName: "lab-web-1",
  },
];

export async function seedSampleFindings(
  db: Db,
  samples: SampleFindingSeed[] = DEFAULT_SAMPLES,
) {
  const created: string[] = [];

  for (const sample of samples) {
    let assetId: string | null = null;
    if (sample.assetName) {
      const [existingAsset] = await db
        .select()
        .from(assets)
        .where(eq(assets.name, sample.assetName))
        .limit(1);
      if (existingAsset) {
        assetId = existingAsset.id;
      } else {
        const [a] = await db
          .insert(assets)
          .values({ name: sample.assetName, environment: "lab" })
          .returning();
        assetId = a.id;
      }
    }

    let vulnerabilityId: string | null = null;
    if (sample.cveId) {
      const [v] = await db
        .select({ id: vulnerabilities.id })
        .from(vulnerabilities)
        .where(eq(vulnerabilities.cveId, sample.cveId))
        .limit(1);
      vulnerabilityId = v?.id ?? null;
    } else if (sample.bduId) {
      const [v] = await db
        .select({ id: vulnerabilities.id })
        .from(vulnerabilities)
        .where(eq(vulnerabilities.bduId, sample.bduId))
        .limit(1);
      vulnerabilityId = v?.id ?? null;
    }

    const [existing] = await db
      .select({ id: findings.id })
      .from(findings)
      .where(eq(findings.title, sample.title))
      .limit(1);
    if (existing) {
      created.push(existing.id);
      continue;
    }

    const [row] = await db
      .insert(findings)
      .values({
        title: sample.title,
        status: sample.status ?? "open",
        severity: sample.severity ?? null,
        cveId: sample.cveId ?? null,
        bduId: sample.bduId ?? null,
        assetId,
        vulnerabilityId,
      })
      .returning();
    created.push(row.id);
  }

  return created;
}
