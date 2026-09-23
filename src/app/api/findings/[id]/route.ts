import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { assets, findings, scanJobs } from "@/db/schema";
import {
  AuthError,
  authErrorResponse,
  requireRole,
  requireSession,
} from "@/lib/auth/rbac";
import {
  canTransitionStatus,
  type FindingStatus,
} from "@/lib/findings/status";
import { apiError } from "@/lib/search/api-error";
import { findingPatchSchema } from "../validation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireSession();
    const { id } = await params;
    const [row] = await db
      .select({
        id: findings.id,
        title: findings.title,
        description: findings.description,
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
        rawEvidence: findings.rawEvidence,
        createdAt: findings.createdAt,
        updatedAt: findings.updatedAt,
      })
      .from(findings)
      .leftJoin(assets, eq(findings.assetId, assets.id))
      .leftJoin(scanJobs, eq(findings.scanJobId, scanJobs.id))
      .where(eq(findings.id, id))
      .limit(1);

    if (!row) return apiError(404, "NOT_FOUND", "Finding not found");
    return NextResponse.json(row);
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("GET /api/findings/[id]", err);
    return apiError(500, "INTERNAL", "Failed to load finding");
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireRole("analyst", "admin");
    const { id } = await params;
    const [existing] = await db
      .select()
      .from(findings)
      .where(eq(findings.id, id))
      .limit(1);
    if (!existing) return apiError(404, "NOT_FOUND", "Finding not found");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(400, "BAD_REQUEST", "Invalid JSON body");
    }

    const parsed = findingPatchSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Validation failed";
      return apiError(400, "VALIDATION_ERROR", msg, parsed.error.flatten());
    }

    const nextStatus = parsed.data.status;
    const from = existing.status as FindingStatus;
    if (!canTransitionStatus(from, nextStatus)) {
      return apiError(
        400,
        "INVALID_STATUS_TRANSITION",
        `Cannot transition from ${from} to ${nextStatus}`,
      );
    }

    const [updated] = await db
      .update(findings)
      .set({
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(findings.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err)!;
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("PATCH /api/findings/[id]", err);
    return apiError(500, "INTERNAL", "Failed to update finding");
  }
}
