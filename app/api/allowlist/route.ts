import { NextResponse } from "next/server";
import {
  createAllowlistSchema,
  createAllowlistTarget,
  listAllowlist,
  parseAllowlistListParams,
} from "@/lib/allowlist";
import {
  jsonError,
  requireApiRole,
  requireApiSession,
} from "@/lib/api/http";

export async function GET(request: Request) {
  try {
    await requireApiSession();
    const { searchParams } = new URL(request.url);
    const params = parseAllowlistListParams(searchParams);
    const result = await listAllowlist(params);
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession();
    requireApiRole(session, ["admin"]);

    const body = await request.json().catch(() => null);
    const parsed = createAllowlistSchema.parse(body);
    const item = await createAllowlistTarget(parsed);
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
