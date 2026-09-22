import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getVulnerabilityById } from "@/lib/vulnerabilities";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const item = await getVulnerabilityById(id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}
