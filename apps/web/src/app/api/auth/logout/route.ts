import { NextRequest } from "next/server";
import { clearAuthCookies, proxyAuth } from "@/lib/authCookies";

export async function POST(req: NextRequest) {
  const res = await proxyAuth(req, "/auth/logout", { method: "POST", body: "{}" });
  clearAuthCookies(res);
  return res;
}
