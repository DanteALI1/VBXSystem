import { NextResponse } from "next/server";
import {
  deleteAsset,
  getAssetById,
  updateAsset,
  updateAssetSchema,
} from "@/lib/assets";
import {
  jsonError,
  requireApiRole,
  requireApiSession,
} from "@/lib/api/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireApiSession();
    const { id } = await context.params;
    const asset = await getAssetById(id);
    if (!asset) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(asset);
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireApiSession();
    requireApiRole(session, ["admin", "analyst"]);

    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = updateAssetSchema.parse(body);
    const asset = await updateAsset(id, parsed);
    if (!asset) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(asset);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const session = await requireApiSession();
    requireApiRole(session, ["admin", "analyst"]);

    const { id } = await context.params;
    const ok = await deleteAsset(id);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return jsonError(err);
  }
}
