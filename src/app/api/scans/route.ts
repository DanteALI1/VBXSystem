import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { scanJobs } from "@/db/schema";
import {
  AuthError,
  authErrorResponse,
  requireMinRole,
  requireSession,
} from "@/lib/auth/rbac";
import { enqueueScanJob } from "@/lib/scans/enqueue";
import {
  ALLOWLIST_REJECTED,
  NUCLEI_TEMPLATE_DENIED,
} from "@/lib/scans/types";
import { apiError } from "@/lib/search/api-error";
import { normalizeTargets, scanCreateSchema } from "./validation";

/**
 * GET /api/scans — list scan jobs (viewer+).
 */
export async function GET(request: Request) {
  try {
    await requireSession();
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    let pageSize = Number(url.searchParams.get("pageSize") ?? 50);
    if (Number.isNaN(pageSize) || pageSize < 1) pageSize = 50;
    pageSize = Math.min(pageSize, 200);
    const offset = (page - 1) * pageSize;

    const items = await db
      .select()
      .from(scanJobs)
      .orderBy(desc(scanJobs.createdAt))
      .limit(pageSize)
      .offset(offset);

    return NextResponse.json({ items, page, pageSize });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("GET /api/scans", err);
    return apiError(500, "INTERNAL", "Failed to list scan jobs");
  }
}

/**
 * POST /api/scans — create + enqueue (analyst+). HTTP only — never runs binaries.
 * Rejects targets outside enabled allowlist with ALLOWLIST_REJECTED.
 */
export async function POST(request: Request) {
  try {
    const { session } = await requireMinRole("analyst");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(400, "BAD_REQUEST", "Invalid JSON body");
    }

    const parsed = scanCreateSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Validation failed";
      return apiError(400, "BAD_REQUEST", msg, parsed.error.flatten());
    }

    const targets = normalizeTargets(parsed.data);
    const result = await enqueueScanJob({
      type: parsed.data.type,
      targets,
      options: parsed.data.options ?? {},
      createdById: session.user.id,
    });

    if (!result.ok) {
      const status =
        result.code === ALLOWLIST_REJECTED ||
        result.code === NUCLEI_TEMPLATE_DENIED
          ? 400
          : 400;
      return apiError(status, result.code, result.message, {
        rejected: result.rejected,
        jobId: result.job?.id,
      });
    }

    return NextResponse.json(
      {
        accepted: true,
        job: result.job,
        queueJobId: result.queueJobId,
      },
      { status: 202 },
    );
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err)!;
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("POST /api/scans", err);
    return apiError(500, "INTERNAL", "Failed to enqueue scan");
  }
}
