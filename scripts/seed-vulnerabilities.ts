import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  vulnerabilities,
  vulnerabilitySources,
  type NewVulnerability,
  type Severity,
  type VulnSource,
} from "@/db/schema";

type SeedSource = {
  source: VulnSource;
  externalUrl: string;
  rawJson?: string;
  rawXml?: string;
};

type SeedVuln = {
  cveId: string | null;
  bduId: string | null;
  title: string;
  description: string;
  severity: Severity;
  cvssScore: string | null;
  publishedAt: Date;
  modifiedAt: Date;
  sources: SeedSource[];
};

const SEED: SeedVuln[] = [
  {
    cveId: "CVE-2024-3094",
    bduId: "BDU:2024-01827",
    title: "XZ Utils backdoor (liblzma)",
    description:
      "Malicious code in XZ Utils versions 5.6.0 and 5.6.1 can compromise sshd via liblzma. Seed record linked to both NVD and BDU.",
    severity: "critical",
    cvssScore: "10.0",
    publishedAt: new Date("2024-03-29T00:00:00Z"),
    modifiedAt: new Date("2024-04-02T00:00:00Z"),
    sources: [
      {
        source: "nvd",
        externalUrl: "https://nvd.nist.gov/vuln/detail/CVE-2024-3094",
        rawJson: JSON.stringify({
          id: "CVE-2024-3094",
          sourceIdentifier: "seed",
        }),
      },
      {
        source: "bdu",
        externalUrl: "https://bdu.fstec.ru/vul/2024-01827",
        rawXml: "<vul><identifier>BDU:2024-01827</identifier></vul>",
      },
    ],
  },
  {
    cveId: "CVE-2021-44228",
    bduId: null,
    title: "Apache Log4j2 remote code execution (Log4Shell)",
    description:
      "JNDI injection in Log4j 2.0-beta9 through 2.15.0 allows remote code execution via crafted log messages.",
    severity: "critical",
    cvssScore: "10.0",
    publishedAt: new Date("2021-12-10T00:00:00Z"),
    modifiedAt: new Date("2021-12-14T00:00:00Z"),
    sources: [
      {
        source: "nvd",
        externalUrl: "https://nvd.nist.gov/vuln/detail/CVE-2021-44228",
        rawJson: JSON.stringify({ id: "CVE-2021-44228", sourceIdentifier: "seed" }),
      },
    ],
  },
  {
    cveId: "CVE-2023-44487",
    bduId: "BDU:2023-05812",
    title: "HTTP/2 Rapid Reset denial of service",
    description:
      "The HTTP/2 protocol allows a denial of service via rapid stream resets (Rapid Reset).",
    severity: "high",
    cvssScore: "7.5",
    publishedAt: new Date("2023-10-10T00:00:00Z"),
    modifiedAt: new Date("2023-10-14T00:00:00Z"),
    sources: [
      {
        source: "nvd",
        externalUrl: "https://nvd.nist.gov/vuln/detail/CVE-2023-44487",
        rawJson: JSON.stringify({ id: "CVE-2023-44487", sourceIdentifier: "seed" }),
      },
      {
        source: "bdu",
        externalUrl: "https://bdu.fstec.ru/vul/2023-05812",
        rawXml: "<vul><identifier>BDU:2023-05812</identifier></vul>",
      },
    ],
  },
  {
    cveId: null,
    bduId: "BDU:2022-01100",
    title: "BDU-only sample: outdated OpenSSL configuration risk",
    description:
      "Illustrative BDU-only vulnerability without a linked CVE identifier for filter/source testing.",
    severity: "medium",
    cvssScore: "5.3",
    publishedAt: new Date("2022-06-01T00:00:00Z"),
    modifiedAt: new Date("2022-06-15T00:00:00Z"),
    sources: [
      {
        source: "bdu",
        externalUrl: "https://bdu.fstec.ru/vul/2022-01100",
        rawXml: "<vul><identifier>BDU:2022-01100</identifier></vul>",
      },
    ],
  },
  {
    cveId: "CVE-2024-21626",
    bduId: null,
    title: "runc container escape via file descriptor leak",
    description:
      "runc versions through 1.1.11 are vulnerable to container escape via crafted /proc and leaked file descriptors.",
    severity: "high",
    cvssScore: "8.6",
    publishedAt: new Date("2024-01-31T00:00:00Z"),
    modifiedAt: new Date("2024-02-05T00:00:00Z"),
    sources: [
      {
        source: "nvd",
        externalUrl: "https://nvd.nist.gov/vuln/detail/CVE-2024-21626",
        rawJson: JSON.stringify({ id: "CVE-2024-21626", sourceIdentifier: "seed" }),
      },
    ],
  },
  {
    cveId: "CVE-2019-0708",
    bduId: null,
    title: "BlueKeep RDP remote code execution",
    description:
      "Remote Desktop Services on Windows allows remote code execution without authentication (BlueKeep).",
    severity: "low",
    cvssScore: "3.7",
    publishedAt: new Date("2019-05-14T00:00:00Z"),
    modifiedAt: new Date("2019-05-20T00:00:00Z"),
    sources: [
      {
        source: "nvd",
        externalUrl: "https://nvd.nist.gov/vuln/detail/CVE-2019-0708",
        rawJson: JSON.stringify({ id: "CVE-2019-0708", sourceIdentifier: "seed" }),
      },
    ],
  },
];

async function findExisting(seed: SeedVuln) {
  if (seed.cveId) {
    const [byCve] = await db
      .select()
      .from(vulnerabilities)
      .where(eq(vulnerabilities.cveId, seed.cveId))
      .limit(1);
    if (byCve) return byCve;
  }
  if (seed.bduId) {
    const [byBdu] = await db
      .select()
      .from(vulnerabilities)
      .where(eq(vulnerabilities.bduId, seed.bduId))
      .limit(1);
    if (byBdu) return byBdu;
  }
  return null;
}

async function upsertSource(
  vulnerabilityId: string,
  source: SeedSource,
) {
  const [existing] = await db
    .select()
    .from(vulnerabilitySources)
    .where(
      and(
        eq(vulnerabilitySources.vulnerabilityId, vulnerabilityId),
        eq(vulnerabilitySources.source, source.source),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(vulnerabilitySources)
      .set({
        externalUrl: source.externalUrl,
        rawJson: source.rawJson ?? null,
        rawXml: source.rawXml ?? null,
        syncedAt: new Date(),
      })
      .where(eq(vulnerabilitySources.id, existing.id));
    return existing.id;
  }

  const [inserted] = await db
    .insert(vulnerabilitySources)
    .values({
      vulnerabilityId,
      source: source.source,
      externalUrl: source.externalUrl,
      rawJson: source.rawJson ?? null,
      rawXml: source.rawXml ?? null,
      syncedAt: new Date(),
    })
    .returning({ id: vulnerabilitySources.id });

  return inserted.id;
}

async function upsertVulnerability(seed: SeedVuln) {
  const existing = await findExisting(seed);

  const values: NewVulnerability = {
    cveId: seed.cveId,
    bduId: seed.bduId,
    title: seed.title,
    description: seed.description,
    severity: seed.severity,
    cvssScore: seed.cvssScore,
    publishedAt: seed.publishedAt,
    modifiedAt: seed.modifiedAt,
  };

  let id: string;
  let action: "inserted" | "updated";

  if (existing) {
    const [updated] = await db
      .update(vulnerabilities)
      .set({
        ...values,
        // Preserve non-null identifiers if seed has null for one side
        cveId: seed.cveId ?? existing.cveId,
        bduId: seed.bduId ?? existing.bduId,
        updatedAt: new Date(),
      })
      .where(eq(vulnerabilities.id, existing.id))
      .returning({ id: vulnerabilities.id });
    id = updated.id;
    action = "updated";
  } else {
    const [inserted] = await db
      .insert(vulnerabilities)
      .values(values)
      .returning({ id: vulnerabilities.id });
    id = inserted.id;
    action = "inserted";
  }

  for (const source of seed.sources) {
    await upsertSource(id, source);
  }

  return { id, action, cveId: seed.cveId, bduId: seed.bduId, title: seed.title };
}

async function main() {
  console.log(`Seeding ${SEED.length} vulnerabilities…`);
  const results = [];
  for (const seed of SEED) {
    const result = await upsertVulnerability(seed);
    results.push(result);
    console.log(
      `  ${result.action}: ${result.id} ${result.cveId ?? "—"} / ${result.bduId ?? "—"} — ${result.title}`,
    );
  }
  console.log(`Done. ${results.length} vulnerabilities upserted.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
