/**
 * Seed bootstrap user (if missing) + sample vulnerabilities from fixtures.
 * Composable / idempotent: upserts by cveId / bduId.
 *
 *   DATABASE_URL=postgresql://vuln:vuln@localhost:5432/vuln pnpm db:seed
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import { XMLParser } from "fast-xml-parser";
import { db } from "../src/db";
import {
  user,
  vulnerabilities,
  vulnerabilityHistory,
  vulnerabilitySources,
  vulnerabilityTagLinks,
  vulnerabilityTags,
} from "../src/db/schema";
import { severityFromCvss } from "../src/lib/domain/severity";

type SeedVuln = {
  cveId?: string | null;
  bduId?: string | null;
  title: string;
  description: string;
  cvssScore?: number | null;
  cvssVector?: string | null;
  epssScore?: number | null;
  kev?: boolean;
  vendors?: string[];
  products?: string[];
  cwes?: string[];
  cpes?: string[];
  references?: { url: string; source?: string }[];
  affected?: { vendor: string; product: string; versions?: string; cpe?: string }[];
  publishedAt?: Date | null;
  updatedAt?: Date | null;
  sources?: {
    source: "nvd" | "bdu";
    rawPayload: unknown;
    sourceSeverity?: string;
    sourceCvssScore?: number;
  }[];
  history?: {
    field: string;
    oldValue?: string | null;
    newValue?: string | null;
    source?: "nvd" | "bdu";
    at?: Date;
  }[];
  tags?: string[];
};

function loadNvdFixture(): SeedVuln {
  const raw = JSON.parse(
    readFileSync(resolve(process.cwd(), "tests/fixtures/nvd-fragment.json"), "utf8"),
  ) as {
    results: {
      cve: {
        id: string;
        published: string;
        lastModified: string;
        descriptions: { lang: string; value: string }[];
        metrics?: {
          cvssMetricV31?: {
            cvssData: { baseScore: number; vectorString: string; baseSeverity: string };
          }[];
        };
        weaknesses?: { description: { lang: string; value: string }[] }[];
        configurations?: { nodes: { cpeMatch: { criteria: string }[] }[] }[];
        references?: { url: string }[];
      };
    }[];
  };

  const cve = raw.results[0].cve;
  const en = cve.descriptions.find((d) => d.lang === "en")?.value ?? "";
  const metric = cve.metrics?.cvssMetricV31?.[0]?.cvssData;
  const cwes =
    cve.weaknesses?.flatMap((w) =>
      w.description.filter((d) => d.lang === "en").map((d) => d.value),
    ) ?? [];
  const cpes =
    cve.configurations?.flatMap((c) =>
      c.nodes.flatMap((n) => n.cpeMatch.map((m) => m.criteria)),
    ) ?? [];

  return {
    cveId: cve.id,
    title: en.slice(0, 120) || cve.id,
    description: en,
    cvssScore: metric?.baseScore ?? null,
    cvssVector: metric?.vectorString ?? null,
    epssScore: 0.91234,
    kev: true,
    vendors: ["ExampleCorp"],
    products: ["Widget"],
    cwes,
    cpes,
    references: (cve.references ?? []).map((r) => ({ url: r.url, source: "nvd" })),
    affected: [{ vendor: "ExampleCorp", product: "Widget", versions: "1.0", cpe: cpes[0] }],
    publishedAt: new Date(cve.published),
    updatedAt: new Date(cve.lastModified),
    sources: [
      {
        source: "nvd",
        rawPayload: cve,
        sourceSeverity: metric?.baseSeverity?.toLowerCase(),
        sourceCvssScore: metric?.baseScore,
      },
    ],
    history: [
      {
        field: "cvssScore",
        oldValue: null,
        newValue: String(metric?.baseScore ?? ""),
        source: "nvd",
        at: new Date(cve.published),
      },
      {
        field: "severity",
        oldValue: null,
        newValue: metric?.baseSeverity?.toLowerCase() ?? "critical",
        source: "nvd",
        at: new Date(cve.lastModified),
      },
    ],
    tags: ["ransomware"],
  };
}

function loadBduFixture() {
  const xml = readFileSync(resolve(process.cwd(), "tests/fixtures/bdu-mini.xml"), "utf8");
  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) => name === "vul" || name === "soft",
  });
  const doc = parser.parse(xml) as {
    vulnerabilities: {
      vul: {
        identifier: string;
        name: string;
        description: string;
        cvss: { vector: string; score: number | string };
        vulnerable_software: { soft: { vendor: string; product: string; version: string }[] };
      }[];
    };
  };
  const vul = doc.vulnerabilities.vul[0];
  const soft = vul.vulnerable_software.soft[0];
  return {
    bduId: vul.identifier,
    title: vul.name,
    description: vul.description,
    raw: vul,
    cvssScore: Number(vul.cvss.score),
    cvssVector: vul.cvss.vector,
    vendors: [soft.vendor],
    products: [soft.product],
  };
}

function extraSamples(): SeedVuln[] {
  const base = new Date("2024-06-01T00:00:00Z");
  const samples: Array<Omit<SeedVuln, "sources" | "history"> & { sourceHint?: "nvd" | "bdu" }> = [
    {
      cveId: "CVE-2024-1001",
      title: "Medium severity sample Apache httpd",
      description: "Sample medium vulnerability in Apache HTTP Server fixture.",
      cvssScore: 5.3,
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N",
      epssScore: 0.05,
      kev: false,
      vendors: ["Apache"],
      products: ["HTTP Server"],
      cwes: ["CWE-200"],
      tags: ["internal"],
    },
    {
      cveId: "CVE-2024-1002",
      title: "High severity sample Microsoft Windows",
      description: "Sample high severity privilege escalation fixture.",
      cvssScore: 7.8,
      cvssVector: "CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H",
      epssScore: 0.42,
      kev: true,
      vendors: ["Microsoft"],
      products: ["Windows"],
      cwes: ["CWE-269"],
      tags: ["ransomware", "internal"],
    },
    {
      cveId: "CVE-2023-9001",
      title: "Low severity information disclosure",
      description: "Sample low severity disclosure fixture.",
      cvssScore: 3.1,
      cvssVector: "CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N",
      epssScore: 0.01,
      kev: false,
      vendors: ["ExampleSoft"],
      products: ["Portal"],
      cwes: ["CWE-200"],
    },
    {
      bduId: "BDU:2024-00099",
      title: "BDU-only fixture entry",
      description: "Запись только БДУ без CVE (fixture).",
      cvssScore: 8.1,
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N",
      kev: false,
      vendors: ["VendorRu"],
      products: ["App"],
      sourceHint: "bdu",
    },
    {
      cveId: "CVE-2022-5001",
      title: "None/informational score sample",
      description: "Sample with CVSS 0.0 none severity.",
      cvssScore: 0,
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N",
      epssScore: 0,
      kev: false,
      vendors: ["NoneCorp"],
      products: ["Idle"],
    },
    {
      cveId: "CVE-2024-2001",
      title: "Critical remote code sample",
      description: "Another critical remote code execution fixture for filters.",
      cvssScore: 9.1,
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N",
      epssScore: 0.77,
      kev: true,
      vendors: ["ExampleCorp"],
      products: ["Gateway"],
      tags: ["ransomware"],
    },
    {
      cveId: "CVE-2024-2002",
      bduId: "BDU:2024-00042",
      title: "Linked mid severity NVD+BDU",
      description: "Second linked CVE/BDU pair for catalog density.",
      cvssScore: 6.5,
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N",
      epssScore: 0.12,
      kev: false,
      vendors: ["Acme"],
      products: ["Router"],
    },
    {
      cveId: "CVE-2021-44228",
      title: "Log4Shell-like fixture (synthetic demo id)",
      description: "Synthetic seed entry used only for UI density — not a live advisory.",
      cvssScore: 10,
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
      epssScore: 0.97,
      kev: true,
      vendors: ["Apache"],
      products: ["Log4j"],
      tags: ["ransomware"],
    },
    {
      cveId: "CVE-2024-3003",
      title: "Medium OpenSSL sample",
      description: "Medium severity TLS library fixture.",
      cvssScore: 5.9,
      cvssVector: "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N",
      epssScore: 0.2,
      kev: false,
      vendors: ["OpenSSL"],
      products: ["OpenSSL"],
    },
  ];

  return samples.map((s, i) => {
    const src: "nvd" | "bdu" = s.sourceHint ?? (s.bduId && !s.cveId ? "bdu" : "nvd");
    const at = new Date(base.getTime() + i * 86400000);
    const { sourceHint: _hint, ...rest } = s;
    void _hint;
    return {
      ...rest,
      publishedAt: at,
      updatedAt: at,
      sources: [
        {
          source: src,
          rawPayload: { seed: true, title: s.title },
          sourceSeverity: severityFromCvss(s.cvssScore ?? null) ?? undefined,
          sourceCvssScore: s.cvssScore ?? undefined,
        },
        ...(s.cveId && s.bduId
          ? [
              {
                source: "bdu" as const,
                rawPayload: { seed: true, bduId: s.bduId },
                sourceSeverity: severityFromCvss(s.cvssScore ?? null) ?? undefined,
                sourceCvssScore: s.cvssScore ?? undefined,
              },
            ]
          : []),
      ],
      history: [{ field: "created", oldValue: null, newValue: "seed", source: src, at }],
    };
  });
}

async function ensureBootstrapUser(): Promise<string> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@local.dev";
  const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (existing) return existing.id;

  const id = `seed_${email.replace(/[^a-z0-9]/gi, "_")}`;
  await db.insert(user).values({
    id,
    name: "Bootstrap Admin",
    email,
    emailVerified: true,
    role: "admin",
  });
  console.log("Created bootstrap user placeholder:", email);
  return id;
}

async function upsertSource(
  vulnId: string,
  src: NonNullable<SeedVuln["sources"]>[number],
  now: Date,
) {
  const existing = await db
    .select()
    .from(vulnerabilitySources)
    .where(
      and(
        eq(vulnerabilitySources.vulnerabilityId, vulnId),
        eq(vulnerabilitySources.source, src.source),
      ),
    )
    .limit(1);

  const payload = {
    rawPayload: src.rawPayload,
    syncedAt: now,
    sourceSeverity: src.sourceSeverity ?? null,
    sourceCvssScore: src.sourceCvssScore != null ? String(src.sourceCvssScore) : null,
  };

  if (existing[0]) {
    await db
      .update(vulnerabilitySources)
      .set(payload)
      .where(eq(vulnerabilitySources.id, existing[0].id));
  } else {
    await db.insert(vulnerabilitySources).values({
      vulnerabilityId: vulnId,
      source: src.source,
      ...payload,
    });
  }
}

async function upsertVuln(seed: SeedVuln, ownerUserId: string) {
  const severity = severityFromCvss(seed.cvssScore ?? null);
  const now = new Date();

  let existingId: string | undefined;
  if (seed.cveId) {
    const [row] = await db
      .select({ id: vulnerabilities.id })
      .from(vulnerabilities)
      .where(eq(vulnerabilities.cveId, seed.cveId))
      .limit(1);
    existingId = row?.id;
  }
  if (!existingId && seed.bduId) {
    const [row] = await db
      .select({ id: vulnerabilities.id })
      .from(vulnerabilities)
      .where(eq(vulnerabilities.bduId, seed.bduId))
      .limit(1);
    existingId = row?.id;
  }

  const values = {
    cveId: seed.cveId ?? null,
    bduId: seed.bduId ?? null,
    title: seed.title,
    description: seed.description,
    severity,
    cvssScore:
      seed.cvssScore != null && !Number.isNaN(seed.cvssScore)
        ? String(seed.cvssScore)
        : null,
    cvssVector: seed.cvssVector ?? null,
    epssScore:
      seed.epssScore != null && !Number.isNaN(seed.epssScore)
        ? String(seed.epssScore)
        : null,
    kev: Boolean(seed.kev),
    vendors: seed.vendors ?? [],
    products: seed.products ?? [],
    cwes: seed.cwes ?? [],
    cpes: seed.cpes ?? [],
    references: seed.references ?? [],
    affected: seed.affected ?? [],
    publishedAt: seed.publishedAt ?? null,
    updatedAt: seed.updatedAt ?? null,
    localSyncedAt: now,
  };

  let vulnId: string;
  if (existingId) {
    await db.update(vulnerabilities).set(values).where(eq(vulnerabilities.id, existingId));
    vulnId = existingId;
  } else {
    const [created] = await db.insert(vulnerabilities).values(values).returning({ id: vulnerabilities.id });
    vulnId = created.id;
  }

  for (const src of seed.sources ?? []) {
    await upsertSource(vulnId, src, now);
  }

  const hist = seed.history ?? [];
  if (hist.length > 0) {
    const existingHist = await db
      .select({ id: vulnerabilityHistory.id })
      .from(vulnerabilityHistory)
      .where(eq(vulnerabilityHistory.vulnerabilityId, vulnId))
      .limit(1);
    if (existingHist.length === 0) {
      await db.insert(vulnerabilityHistory).values(
        hist.map((h) => ({
          vulnerabilityId: vulnId,
          at: h.at ?? now,
          field: h.field,
          oldValue: h.oldValue ?? null,
          newValue: h.newValue ?? null,
          source: h.source,
        })),
      );
    }
  }

  for (const tagName of seed.tags ?? []) {
    let [tag] = await db
      .select()
      .from(vulnerabilityTags)
      .where(eq(vulnerabilityTags.name, tagName))
      .limit(1);
    if (!tag) {
      [tag] = await db
        .insert(vulnerabilityTags)
        .values({ name: tagName, ownerUserId })
        .returning();
    }
    const links = await db
      .select()
      .from(vulnerabilityTagLinks)
      .where(eq(vulnerabilityTagLinks.vulnerabilityId, vulnId));
    if (!links.some((l) => l.tagId === tag.id)) {
      await db.insert(vulnerabilityTagLinks).values({
        vulnerabilityId: vulnId,
        tagId: tag.id,
      });
    }
  }

  return vulnId;
}

async function main() {
  console.log("db:seed — vulnerabilities from fixtures");
  const ownerId = await ensureBootstrapUser();

  const nvd = loadNvdFixture();
  const bdu = loadBduFixture();

  const linked: SeedVuln = {
    ...nvd,
    bduId: bdu.bduId,
    description: `${nvd.description}\n\n[BDU] ${bdu.description}`,
    vendors: [...new Set([...(nvd.vendors ?? []), ...bdu.vendors])],
    products: [...new Set([...(nvd.products ?? []), ...bdu.products])],
    sources: [
      ...(nvd.sources ?? []),
      {
        source: "bdu",
        rawPayload: bdu.raw,
        sourceSeverity: "critical",
        sourceCvssScore: bdu.cvssScore,
      },
    ],
    history: [
      ...(nvd.history ?? []),
      {
        field: "bduId",
        oldValue: null,
        newValue: bdu.bduId,
        source: "bdu",
        at: new Date("2024-02-15T00:00:00Z"),
      },
    ],
  };

  const linkedId = await upsertVuln(linked, ownerId);
  console.log("Seeded linked CVE+BDU:", linked.cveId, linked.bduId, linkedId);

  for (const s of extraSamples()) {
    await upsertVuln(s, ownerId);
  }

  const all = await db.select({ id: vulnerabilities.id }).from(vulnerabilities);
  console.log(`Seed complete. vulnerabilities count = ${all.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
