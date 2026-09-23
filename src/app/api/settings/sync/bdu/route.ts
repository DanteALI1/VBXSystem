import { NextResponse } from "next/server";
import {
  authErrorResponse,
  requireMinRole,
} from "@/lib/auth";
import { apiError } from "@/lib/search/api-error";
import { enqueueBduSync } from "@/lib/sync/bdu";

/**
 * POST /api/settings/sync/bdu — enqueue BDU XML download sync (non-blocking).
 * Analyst+.
 */
export async function POST() {
  try {
    const { session } = await requireMinRole("analyst");
    const job = await enqueueBduSync({
      mode: "download",
      requestedByUserId: session.user.id,
    });
    return NextResponse.json(
      {
        ok: true,
        queued: true,
        jobId: job.id,
        mode: "download",
      },
      { status: 202 },
    );
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    const message = err instanceof Error ? err.message : String(err);
    return apiError(500, "BDU_ENQUEUE_FAILED", message);
  }
}
