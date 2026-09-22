import { NextResponse } from "next/server";
import {
  createAsset,
  createAssetSchema,
  listAssets,
  parseAssetListParams,
} from "@/lib/assets";
import {
  jsonError,
  requireApiRole,
  requireApiSession,
} from "@/lib/api/http";

export async function GET(request: Request) {
  try {
    await requireApiSession();
    const { searchParams } = new URL(request.url);
    const params = parseAssetListParams(searchParams);
    const result = await listAssets(params);
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession();
    requireApiRole(session, ["admin", "analyst"]);

    const body = await request.json().catch(() => null);
    const parsed = createAssetSchema.parse(body);
    const asset = await createAsset(parsed);
    return NextResponse.json(asset, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
