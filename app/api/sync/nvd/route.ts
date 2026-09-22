import { NextResponse } from "next/server";
import {
  AuthError,
  canTriggerSync,
  requireRole,
  type AppRole,
} from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { ensureSyncState } from "@/lib/sync/state";
import { enqueueNvdSync } from "@/lib/sync/queues";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const role = requireRole(session, ["admin", "analyst", "viewer"]);
    if (!canTriggerSync(role as AppRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const state = await ensureSyncState("nvd");
    if (state.status === "running") {
      return NextResponse.json(
        { error: "NVD sync already running" },
        { status: 409 },
      );
    }

    let body: {
      days?: number;
      force?: boolean;
      mode?: "live" | "fixture";
    } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }

    const { jobId } = await enqueueNvdSync({
      triggeredBy: session!.user.id,
      days: body.days,
      force: body.force,
      mode: body.mode,
    });

    return NextResponse.json({ jobId }, { status: 202 });
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
