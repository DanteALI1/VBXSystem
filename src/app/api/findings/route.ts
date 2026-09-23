import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { assets, findings, scanJobs } from "@/db/schema";
import { authErrorResponse, requireSession } from "@/lib/auth/rbac";
import { isFindingStatus } from "@/lib/findings/status";
import { apiError } from "@/lib/search/api-error";
import { SEVERITY_VALUES } from "./validation";

export async function GET(request: Request) {
  try {
    await requireSession();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const statusParam = (url.searchParams.get("status") ?? "").trim();
    const severityParam = (url.searchParams.get("severity") ?? "").trim();
    const assetId = (url.searchParams.get("assetId") ?? "").trim();
    const vulnerabilityId = (url.searchParams.get("vulnerabilityId") ?? "").trim();
    const cveId = (url.searchParams.get("cveId") ?? "").trim();
    const bduId = (url.searchParams.get("bduId") ?? "").trim();
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    let pageSize = Number(url.searchParams.get("pageSize") ?? 50);
    if (Number.isNaN(pageSize) || pageSize < 1) pageSize = 50;
    pageSize = Math.min(pageSize, 200);
    const offset = (page - 1) * pageSize;

    const filters: SQL[] = [];
    if (statusParam) {
      if (!isFindingStatus(statusParam)) {
        return apiError(400, "VALIDATION_ERROR", `Invalid status: ${statusParam}`);
      }
      filters.push(eq(findings.status, statusParam));
    }
    if (severityParam) {
      if (!(SEVERITY_VALUES as readonly string[]).includes(severityParam)) {
        return apiError(
          400,
          "VALIDATION_ERROR",
          `Invalid severity: ${severityParam}`,
        );
      }
      filters.push(
        eq(
          findings.severity,
          severityParam as (typeof SEVERITY_VALUES)[number],
        ),
      );
    }
    if (assetId) filters.push(eq(findings.assetId, assetId));

    // Correlation: vulnerabilityId OR cveId OR bduId (any match)
    const correlate: SQL[] = [];
    if (vulnerabilityId) correlate.push(eq(findings.vulnerabilityId, vulnerabilityId));
    if (cveId) correlate.push(eq(findings.cveId, cveId));
    if (bduId) correlate.push(eq(findings.bduId, bduId));
    if (correlate.length === 1) {
      filters.push(correlate[0]!);
    } else if (correlate.length > 1) {
      filters.push(or(...correlate)!);
    }

    if (q) {
      const like = `%${q}%`;
      filters.push(
        or(
          ilike(findings.title, like),
          ilike(findings.cveId, like),
          ilike(findings.bduId, like),
          ilike(assets.name, like),
        )!,
      );
    }
    const where = filters.length ? and(...filters) : undefined;

    const base = db
      .select({
        id: findings.id,
        title: findings.title,
        status: findings.status,
        severity: findings.severity,
        assetId: findings.assetId,
        assetName: assets.name,
        serviceId: findings.serviceId,
        vulnerabilityId: findings.vulnerabilityId,
        cveId: findings.cveId,
        bduId: findings.bduId,
        scanJobId: findings.scanJobId,
        scanJobType: scanJobs.type,
        createdAt: findings.createdAt,
        updatedAt: findings.updatedAt,
      })
      .from(findings)
      .leftJoin(assets, eq(findings.assetId, assets.id))
      .leftJoin(scanJobs, eq(findings.scanJobId, scanJobs.id));

    const items = await (where ? base.where(where) : base)
      .orderBy(desc(findings.updatedAt))
      .limit(pageSize)
      .offset(offset);

    const countBase = db
      .select({ total: count() })
      .from(findings)
      .leftJoin(assets, eq(findings.assetId, assets.id));
    const [{ total }] = where
      ? await countBase.where(where)
      : await countBase;

    return NextResponse.json({
      items,
      page,
      pageSize,
      total,
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("GET /api/findings", err);
    return apiError(500, "INTERNAL", "Failed to list findings");
  }
}
