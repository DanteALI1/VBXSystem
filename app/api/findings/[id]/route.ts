import { NextResponse } from "next/server";
import {
  jsonError,
  requireApiRole,
  requireApiSession,
} from "@/lib/api/http";
import {
  getFindingById,
  updateFindingStatus,
  updateFindingStatusSchema,
} from "@/lib/findings";
import type { FindingStatus } from "@/db/schema";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireApiSession();
    const { id } = await context.params;
    const finding = await getFindingById(id);
    if (!finding) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(finding);
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireApiSession();
    const role = requireApiRole(session, ["admin", "analyst"]);

    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = updateFindingStatusSchema.parse(body);

    const finding = await updateFindingStatus(
      id,
      parsed.status as FindingStatus,
      role,
    );
    if (!finding) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(finding);
  } catch (err) {
    return jsonError(err);
  }
}
