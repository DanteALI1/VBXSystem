import { NextRequest } from "next/server";
import { proxyAuth } from "@/lib/authCookies";

export async function POST(req: NextRequest) {
  const body = await req.text();
  return proxyAuth(req, "/auth/login", { method: "POST", body });
}
