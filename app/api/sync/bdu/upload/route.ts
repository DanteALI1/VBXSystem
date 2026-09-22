import { NextResponse } from "next/server";
import {
  AuthError,
  canTriggerSync,
  requireRole,
  type AppRole,
} from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { saveUploadedBduXml } from "@/lib/bdu/download";
import { ensureSyncState } from "@/lib/sync/state";
import { enqueueBduSync } from "@/lib/sync/queues";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const role = requireRole(session, ["admin", "analyst", "viewer"]);
    if (!canTriggerSync(role as AppRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const state = await ensureSyncState("bdu");
    if (state.status === "running") {
      return NextResponse.json(
        { error: "BDU sync already running" },
        { status: 409 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing multipart file field 'file'" },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    const force = form.get("force") === "true" || form.get("force") === "1";
    const safeName = (file.name || "upload.xml").replace(/[^\w.\-]+/g, "_");
    const uploadedPath = await saveUploadedBduXml(
      buf,
      `upload-${Date.now()}-${safeName}`,
    );

    const { jobId } = await enqueueBduSync({
      triggeredBy: session!.user.id,
      uploadedPath,
      force,
    });

    return NextResponse.json({ jobId, uploadedPath }, { status: 202 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    throw err;
  }
}
