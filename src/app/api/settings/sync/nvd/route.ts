import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireMinRole } from "@/lib/auth/rbac";
import { enqueueNvdSync } from "@/lib/sync/nvd";

const bodySchema = z
  .object({
    mode: z.enum(["incremental", "full"]).optional(),
    lastModStartDate: z.string().optional(),
    lastModEndDate: z.string().optional(),
    cveId: z.string().optional(),
  })
  .optional();

/**
 * POST /api/settings/sync/nvd — enqueue NVD sync (analyst+).
 * Returns 202 + job id immediately; never blocks on full sync.
 */
export async function POST(request: Request) {
  try {
    const { session } = await requireMinRole("analyst");

    let body: z.infer<typeof bodySchema> = {};
    const text = await request.text();
    if (text.trim()) {
      const parsed = bodySchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid body", details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      body = parsed.data ?? {};
    }

    const { jobId, queue } = await enqueueNvdSync({
      mode: body?.mode,
      lastModStartDate: body?.lastModStartDate,
      lastModEndDate: body?.lastModEndDate,
      cveId: body?.cveId,
      requestedByUserId: session.user.id,
      requestedAt: new Date().toISOString(),
    });

    return NextResponse.json(
      { accepted: true, jobId, queue, source: "nvd" },
      { status: 202 },
    );
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    throw err;
  }
}
