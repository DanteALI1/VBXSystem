import { NextResponse } from "next/server";
import {
  authErrorResponse,
  requireRole,
} from "@/lib/auth";
import { apiError } from "@/lib/search/api-error";
import { enqueueBduSync, saveBduUpload } from "@/lib/sync/bdu";

const MAX_UPLOAD_BYTES = Number(
  process.env.BDU_UPLOAD_MAX_BYTES ?? 64 * 1024 * 1024,
);

/**
 * POST /api/settings/sync/bdu/upload — admin upload fallback when download fails.
 * Multipart field `file` (XML). Saves under BDU_UPLOAD_DIR and enqueues parse job.
 */
export async function POST(request: Request) {
  try {
    const { session } = await requireRole("admin");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return apiError(400, "BAD_REQUEST", "multipart field `file` is required");
    }
    if (file.size <= 0) {
      return apiError(400, "BAD_REQUEST", "empty file");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return apiError(413, "PAYLOAD_TOO_LARGE", `max ${MAX_UPLOAD_BYTES} bytes`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = buffer.toString("utf8");
    if (!text.includes("<vul") && !text.includes("<vulnerabilities")) {
      return apiError(400, "BAD_REQUEST", "file does not look like BDU XML");
    }

    const { filePath, fileHash } = await saveBduUpload(
      buffer,
      file.name || "bdu.xml",
    );

    const job = await enqueueBduSync({
      mode: "upload",
      filePath,
      requestedByUserId: session.user.id,
    });

    return NextResponse.json(
      {
        ok: true,
        queued: true,
        jobId: job.id,
        mode: "upload",
        filePath,
        fileHash,
      },
      { status: 202 },
    );
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    const message = err instanceof Error ? err.message : String(err);
    return apiError(500, "BDU_UPLOAD_FAILED", message);
  }
}
