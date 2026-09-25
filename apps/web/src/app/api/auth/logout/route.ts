import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookies, proxyAuth, requireCsrf } from "@/lib/authCookies";

export async function POST(req: NextRequest) {
  const blocked = requireCsrf(req);
  if (blocked) return blocked;
  const res = await proxyAuth(req, "/auth/logout", { method: "POST", body: "{}" });
  clearAuthCookies(res);
  return res;
}
