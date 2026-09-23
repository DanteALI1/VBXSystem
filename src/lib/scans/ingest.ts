import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  assets,
  findings,
  services,
  vulnerabilities,
  type ScanJob,
} from "@/db/schema";
import type { FindingDraft } from "./types";
import { readReportFile } from "./report-store";
import { getAdapter } from "./adapter";
import { reportDirForJob } from "./report-store";
import type { ScanJobContext } from "./types";

function extractIp(host: string | undefined): string | null {
  if (!host) return null;
  const trimmed = host.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) return trimmed;
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
      ? trimmed
      : `http://${trimmed}`;
    const u = new URL(withScheme);
    const h = u.hostname;
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) ? h : h || null;
  } catch {
    return trimmed || null;
  }
}

async function resolveOrCreateAsset(opts: {
  host?: string;
  createdById?: string | null;
  fallbackTarget?: string;
}): Promise<string> {
  const ipOrHost =
    extractIp(opts.host) ?? extractIp(opts.fallbackTarget) ?? "unknown";
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(ipOrHost);

  const existing = await db
    .select({ id: assets.id })
    .from(assets)
    .where(
      isIp
        ? eq(assets.ip, ipOrHost)
        : or(eq(assets.hostname, ipOrHost), eq(assets.name, ipOrHost)),
    )
    .limit(1);

  if (existing[0]) return existing[0].id;

  const [created] = await db
    .insert(assets)
    .values({
      name: ipOrHost,
      ip: isIp ? ipOrHost : null,
      hostname: isIp ? null : ipOrHost,
      createdById: opts.createdById ?? null,
      environment: "scan",
    })
    .returning({ id: assets.id });

  return created.id;
}

async function upsertService(opts: {
  assetId: string;
  draft: FindingDraft;
}): Promise<string | null> {
  const port = opts.draft.port;
  if (port == null || !Number.isFinite(port)) return null;
  const protocol = (opts.draft.protocol ?? "tcp").toLowerCase();
  const now = new Date();

  const [existing] = await db
    .select()
    .from(services)
    .where(
      and(
        eq(services.assetId, opts.assetId),
        eq(services.port, port),
        eq(services.protocol, protocol),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(services)
      .set({
        name: opts.draft.serviceName ?? existing.name,
        product: opts.draft.product ?? existing.product,
        version: opts.draft.version ?? existing.version,
        banner: opts.draft.banner ?? existing.banner,
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(services.id, existing.id))
      .returning({ id: services.id });
    return updated.id;
  }

  const [created] = await db
    .insert(services)
    .values({
      assetId: opts.assetId,
      port,
      protocol,
      name: opts.draft.serviceName ?? null,
      product: opts.draft.product ?? null,
      version: opts.draft.version ?? null,
      banner: opts.draft.banner ?? null,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .returning({ id: services.id });
  return created.id;
}

async function linkVulnerability(
  cveId: string | null | undefined,
): Promise<string | null> {
  if (!cveId) return null;
  const [row] = await db
    .select({ id: vulnerabilities.id })
    .from(vulnerabilities)
    .where(eq(vulnerabilities.cveId, cveId.toUpperCase()))
    .limit(1);
  return row?.id ?? null;
}

async function upsertFinding(opts: {
  draft: FindingDraft;
  assetId: string;
  serviceId: string | null;
  scanJobId: string;
}): Promise<string> {
  const cveId = opts.draft.cveId?.toUpperCase() ?? null;
  const vulnerabilityId = await linkVulnerability(cveId);
  const now = new Date();

  // Dedup key: asset + optional service + (cveId or title)
  const conditions = [
    eq(findings.assetId, opts.assetId),
    eq(findings.title, opts.draft.title),
  ];
  if (opts.serviceId) {
    conditions.push(eq(findings.serviceId, opts.serviceId));
  } else {
    conditions.push(isNull(findings.serviceId));
  }
  if (cveId) {
    conditions.push(eq(findings.cveId, cveId));
  }

  const [existing] = await db
    .select({ id: findings.id })
    .from(findings)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    await db
      .update(findings)
      .set({
        description: opts.draft.description ?? undefined,
        severity: opts.draft.severity ?? undefined,
        vulnerabilityId: vulnerabilityId ?? undefined,
        cveId: cveId ?? undefined,
        rawEvidence: opts.draft.rawEvidence ?? undefined,
        scanJobId: opts.scanJobId,
        updatedAt: now,
      })
      .where(eq(findings.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(findings)
    .values({
      title: opts.draft.title,
      description: opts.draft.description ?? null,
      status: "open",
      severity: opts.draft.severity ?? null,
      assetId: opts.assetId,
      serviceId: opts.serviceId,
      vulnerabilityId,
      cveId,
      bduId: opts.draft.bduId ?? null,
      scanJobId: opts.scanJobId,
      rawEvidence: opts.draft.rawEvidence ?? null,
    })
    .returning({ id: findings.id });

  return created.id;
}

export type IngestResult = {
  servicesUpserted: number;
  findingsUpserted: number;
  drafts: FindingDraft[];
};

/**
 * Parse report via adapter and upsert Service / Finding rows.
 */
export async function ingestScanReport(
  job: ScanJob,
  reportPath: string,
): Promise<IngestResult> {
  const adapter = getAdapter(job.type);
  const report = await readReportFile(reportPath);
  const ctx: ScanJobContext = {
    id: job.id,
    type: job.type,
    targets: job.targets,
    options: job.options ?? {},
    reportDir: reportDirForJob(job.id),
  };
  const drafts = adapter.parse(report, ctx);

  let servicesUpserted = 0;
  let findingsUpserted = 0;

  for (const draft of drafts) {
    const assetId = await resolveOrCreateAsset({
      host: draft.host,
      createdById: job.createdById,
      fallbackTarget: job.targets[0],
    });

    const serviceId = await upsertService({ assetId, draft });
    if (draft.kind === "service" || draft.port != null) {
      if (serviceId) servicesUpserted += 1;
    }

    if (draft.kind === "finding" || draft.cveId) {
      await upsertFinding({
        draft,
        assetId,
        serviceId,
        scanJobId: job.id,
      });
      findingsUpserted += 1;
    } else if (draft.kind === "service") {
      // Optional inventory evidence finding — skip to avoid noise; services are enough for nmap
    }
  }

  return { servicesUpserted, findingsUpserted, drafts };
}

/** Direct ingest from drafts (unit/integration helpers). */
export async function ingestDrafts(
  job: ScanJob,
  drafts: FindingDraft[],
): Promise<IngestResult> {
  let servicesUpserted = 0;
  let findingsUpserted = 0;
  for (const draft of drafts) {
    const assetId = await resolveOrCreateAsset({
      host: draft.host,
      createdById: job.createdById,
      fallbackTarget: job.targets[0],
    });
    const serviceId = await upsertService({ assetId, draft });
    if (serviceId && (draft.kind === "service" || draft.port != null)) {
      servicesUpserted += 1;
    }
    if (draft.kind === "finding" || draft.cveId) {
      await upsertFinding({
        draft,
        assetId,
        serviceId,
        scanJobId: job.id,
      });
      findingsUpserted += 1;
    }
  }
  return { servicesUpserted, findingsUpserted, drafts };
}
