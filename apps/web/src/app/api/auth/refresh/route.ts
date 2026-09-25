import { NextRequest } from "next/server";
import { proxyAuth, requireCsrf } from "@/lib/authCookies";

export async function POST(req: NextRequest) {
  const blocked = requireCsrf(req);
  if (blocked) return blocked;
  const body = await req.text();
  return proxyAuth(req, "/auth/refresh", {
    method: "POST",
    body: body && body.trim() ? body : "{}",
  });
}
