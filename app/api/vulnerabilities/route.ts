import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listVulnerabilities, parseListParams } from "@/lib/vulnerabilities";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const params = parseListParams(searchParams);
  const result = await listVulnerabilities(params);
  return NextResponse.json(result);
}
