import { NextResponse } from "next/server";
import { jsonError, requireApiSession } from "@/lib/api/http";
import { listFindings, parseFindingListParams } from "@/lib/findings";

export async function GET(request: Request) {
  try {
    await requireApiSession();
    const { searchParams } = new URL(request.url);
    const params = parseFindingListParams(searchParams);
    const result = await listFindings(params);
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err);
  }
}
