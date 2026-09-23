import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { syncState } from "@/db/schema";
import { authErrorResponse, requireSession } from "@/lib/auth/rbac";

/**
 * GET /api/settings/sync — SyncState snapshot (viewer+).
 * Modular root for settings sync; BDU enqueue lives alongside `/nvd`.
 */
export async function GET() {
  try {
    await requireSession();

    const rows = await db.select().from(syncState);
    const bySource = Object.fromEntries(rows.map((r) => [r.source, r]));

    const nvd =
      bySource.nvd ??
      (await db.query.syncState.findFirst({
        where: eq(syncState.source, "nvd"),
      }));

    return NextResponse.json({
      sources: {
        nvd: nvd
          ? {
              source: nvd.source,
              lastSuccessAt: nvd.lastSuccessAt,
              lastAttemptAt: nvd.lastAttemptAt,
              lastError: nvd.lastError,
              cursor: nvd.cursor,
              meta: nvd.meta,
              updatedAt: nvd.updatedAt,
            }
          : null,
        bdu: bySource.bdu
          ? {
              source: bySource.bdu.source,
              lastSuccessAt: bySource.bdu.lastSuccessAt,
              lastAttemptAt: bySource.bdu.lastAttemptAt,
              lastError: bySource.bdu.lastError,
              cursor: bySource.bdu.cursor,
              meta: bySource.bdu.meta,
              updatedAt: bySource.bdu.updatedAt,
            }
          : null,
      },
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    throw err;
  }
}
