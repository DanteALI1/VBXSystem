import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { scanJobs } from "@/db/schema";
import { authErrorResponse, requireSession } from "@/lib/auth/rbac";
import { apiError } from "@/lib/search/api-error";

/**
 * GET /api/scans/:id
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await context.params;
    const [job] = await db
      .select()
      .from(scanJobs)
      .where(eq(scanJobs.id, id))
      .limit(1);
    if (!job) return apiError(404, "NOT_FOUND", "Scan job not found");
    return NextResponse.json(job);
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("GET /api/scans/[id]", err);
    return apiError(500, "INTERNAL", "Failed to load scan job");
  }
}
