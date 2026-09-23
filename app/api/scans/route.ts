import { NextResponse } from "next/server";
import {
  canCreateScan,
  type AppRole,
} from "@/lib/auth/roles";
import {
  jsonError,
  requireApiRole,
  requireApiSession,
} from "@/lib/api/http";
import {
  createAndEnqueueScan,
  createScanSchema,
  listScans,
  parseScanListParams,
} from "@/lib/scans";

export async function GET(request: Request) {
  try {
    await requireApiSession();
    const { searchParams } = new URL(request.url);
    const params = parseScanListParams(searchParams);
    const result = await listScans(params);
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession();
    const role = requireApiRole(session, ["admin", "analyst"]) as AppRole;
    if (!canCreateScan(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createScanSchema.parse(body);
    const scan = await createAndEnqueueScan(parsed, session.user.id);
    return NextResponse.json(
      { id: scan.id, status: scan.status },
      { status: 202 },
    );
  } catch (err) {
    return jsonError(err);
  }
}
