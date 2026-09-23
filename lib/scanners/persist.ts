import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assets, findings, services, vulnerabilities } from "@/db/schema";
import {
  extractHostnameFromTarget,
  extractIpFromTarget,
} from "./fixture";
import type { FindingDraft, PersistScanResult } from "./types";

/** Resolve or create an asset for a scan target (IP / hostname). */
export async function resolveAssetForTarget(target: string): Promise<string> {
  const ip = extractIpFromTarget(target);
  const hostname = extractHostnameFromTarget(target);

  if (ip) {
    const [byIp] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.ip, ip))
      .limit(1);
    if (byIp) return byIp.id;
  }

  if (hostname) {
    const [byHost] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.hostname, hostname))
      .limit(1);
    if (byHost) return byHost.id;
  }

  const resolvedIp = ip ?? "0.0.0.0";
  const resolvedHostname =
    hostname ?? (ip ? `host-${ip.replace(/\./g, "-")}` : `target-${Date.now()}`);

  const [created] = await db
    .insert(assets)
    .values({
      hostname: resolvedHostname,
      ip: resolvedIp,
      description: `Auto-created from scan target ${target}`,
    })
    .returning({ id: assets.id });

  return created.id;
}

async function upsertService(
  assetId: string,
  service: NonNullable<FindingDraft["service"]>,
): Promise<string> {
  const [existing] = await db
    .select()
    .from(services)
    .where(
      and(
        eq(services.assetId, assetId),
        eq(services.port, service.port),
        eq(services.protocol, service.protocol),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(services)
      .set({
        name: service.name ?? existing.name,
        product: service.product ?? existing.product,
        version: service.version ?? existing.version,
      })
      .where(eq(services.id, existing.id))
      .returning({ id: services.id });
    return updated.id;
  }

  const [inserted] = await db
    .insert(services)
    .values({
      assetId,
      port: service.port,
      protocol: service.protocol,
      name: service.name ?? null,
      product: service.product ?? null,
      version: service.version ?? null,
    })
    .returning({ id: services.id });
  return inserted.id;
}

async function lookupVulnerabilityId(
  cveId: string | undefined,
): Promise<string | null> {
  if (!cveId) return null;
  const [row] = await db
    .select({ id: vulnerabilities.id })
    .from(vulnerabilities)
    .where(eq(vulnerabilities.cveId, cveId.toUpperCase()))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Persist FindingDraft[]: upsert services (nmap) and insert findings.
 * Deduplicates service upserts by port/protocol within the batch.
 */
export async function persistFindingDrafts(args: {
  drafts: FindingDraft[];
  scanJobId: string;
  target: string;
  defaultAssetId?: string | null;
}): Promise<PersistScanResult> {
  const assetId =
    args.defaultAssetId ?? (await resolveAssetForTarget(args.target));

  const serviceCache = new Map<string, string>();
  let servicesUpserted = 0;
  let findingsCreated = 0;

  for (const draft of args.drafts) {
    const draftAssetId = draft.assetId ?? assetId;
    let serviceId: string | null = null;

    if (draft.service) {
      const key = `${draftAssetId}:${draft.service.port}:${draft.service.protocol}`;
      let cached = serviceCache.get(key);
      if (!cached) {
        cached = await upsertService(draftAssetId, draft.service);
        serviceCache.set(key, cached);
        servicesUpserted += 1;
      }
      serviceId = cached;
    }

    const vulnerabilityId = await lookupVulnerabilityId(draft.cveId);

    await db.insert(findings).values({
      assetId: draftAssetId,
      serviceId,
      scanJobId: args.scanJobId,
      vulnerabilityId,
      title: draft.title,
      description: draft.description ?? null,
      severity: draft.severity,
      status: "open",
      cveId: draft.cveId ? draft.cveId.toUpperCase() : null,
    });
    findingsCreated += 1;
  }

  return { servicesUpserted, findingsCreated, assetId };
}
