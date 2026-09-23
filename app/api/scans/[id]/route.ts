import { NextResponse } from "next/server";
import { jsonError, requireApiSession } from "@/lib/api/http";
import { getScanById } from "@/lib/scans";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiSession();
    const { id } = await context.params;
    const scan = await getScanById(id);
    if (!scan) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(scan);
  } catch (err) {
    return jsonError(err);
  }
}
