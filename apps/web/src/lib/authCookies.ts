import { NextRequest, NextResponse } from "next/server";

const ACCESS = "vbx_access";
const REFRESH = "vbx_refresh";

function apiBase() {
  return process.env.VBX_API_INTERNAL_URL || "http://api:8000";
}

function cookieSecure() {
  return process.env.VBX_COOKIE_SECURE === "true" || process.env.VBX_COOKIE_SECURE === "1";
}

export function authCookiesEnabled() {
  return process.env.VBX_AUTH_COOKIES === "true" || process.env.VBX_AUTH_COOKIES === "1";
}

export function setAuthCookies(res: NextResponse, access: string, refresh: string) {
  if (!authCookiesEnabled()) return;
  const secure = cookieSecure();
  const common = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
  };
  res.cookies.set(ACCESS, access, { ...common, maxAge: 60 * 60 });
  res.cookies.set(REFRESH, refresh, { ...common, maxAge: 60 * 60 * 24 * 14 });
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS, "", { httpOnly: true, path: "/", maxAge: 0 });
  res.cookies.set(REFRESH, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function proxyAuth(
  req: NextRequest,
  upstreamPath: string,
  init?: RequestInit,
): Promise<NextResponse> {
  const url = `${apiBase()}${upstreamPath}`;
  const headers = new Headers(init?.headers || {});
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  // Forward refresh cookie to API when present
  const refresh = req.cookies.get(REFRESH)?.value;
  const access = req.cookies.get(ACCESS)?.value;
  if (refresh || access) {
    const parts: string[] = [];
    if (access) parts.push(`${ACCESS}=${access}`);
    if (refresh) parts.push(`${REFRESH}=${refresh}`);
    headers.set("Cookie", parts.join("; "));
  }
  const upstream = await fetch(url, { ...init, headers });
  const data = await upstream.json().catch(() => ({}));
  const res = NextResponse.json(data, { status: upstream.status });
  if (
    authCookiesEnabled() &&
    upstream.ok &&
    typeof data.access_token === "string" &&
    typeof data.refresh_token === "string"
  ) {
    setAuthCookies(res, data.access_token, data.refresh_token);
  }
  return res;
}
