import { NextRequest, NextResponse } from "next/server";
import { setAuthCookies, authCookiesEnabled } from "@/lib/authCookies";

function apiBase() {
  return process.env.VBX_API_INTERNAL_URL || "http://api:8000";
}

function safeNext(path: unknown): string {
  if (typeof path !== "string") return "/dashboard";
  const p = path.trim() || "/dashboard";
  if (!p.startsWith("/") || p.startsWith("//") || p.includes("://") || p.includes("\\")) {
    return "/dashboard";
  }
  return p;
}

/** OIDC redirect_uri — exchange via API, set cookies, redirect into app. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qs = new URLSearchParams(url.searchParams);
  qs.set("format", "json");
  const upstream = await fetch(`${apiBase()}/auth/sso/callback?${qs}`, {
    headers: { Accept: "application/json" },
    redirect: "manual",
  });

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "SSO callback failed";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(detail)}`, req.url));
  }

  const dest = safeNext(data.next);

  if (authCookiesEnabled() && data.access_token && data.refresh_token) {
    const res = NextResponse.redirect(new URL(dest, req.url));
    setAuthCookies(res, data.access_token, data.refresh_token);
    return res;
  }

  if (data.access_token) {
    const q = new URLSearchParams({
      access_token: data.access_token,
      refresh_token: data.refresh_token || "",
      next: dest,
    });
    return NextResponse.redirect(new URL(`/login/sso?${q}`, req.url));
  }

  return NextResponse.redirect(new URL("/login?error=sso", req.url));
}
