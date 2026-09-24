import { NextRequest } from "next/server";
import { proxyAuth } from "@/lib/authCookies";

export async function POST(req: NextRequest) {
  const body = await req.text();
  return proxyAuth(req, "/auth/refresh", {
    method: "POST",
    body: body && body.trim() ? body : "{}",
  });
}
