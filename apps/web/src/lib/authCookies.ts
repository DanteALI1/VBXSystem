import { NextRequest, NextResponse } from "next/server";
import { randomBytes, timingSafeEqual } from "crypto";

const ACCESS = "vbx_access";
const REFRESH = "vbx_refresh";
const CSRF = "vbx_csrf";

function apiBase() {
  return process.env.VBX_API_INTERNAL_URL || "http://api:8000";
}

function cookieSecure() {
  return process.env.VBX_COOKIE_SECURE === "true" || process.env.VBX_COOKIE_SECURE === "1";
}

/** Explicit VBX_AUTH_COOKIES wins; else prod profile prefers cookies. */
export function authCookiesEnabled() {
  const raw = process.env.VBX_AUTH_COOKIES;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  const profile = (process.env.VBX_PROFILE || "").trim().toLowerCase();
  return profile === "prod";
}

function cookieCommon() {
  return {
    sameSite: "lax" as const,
    secure: cookieSecure(),
    path: "/",
  };
}

export function setAuthCookies(res: NextResponse, access: string, refresh: string) {
  if (!authCookiesEnabled()) return;
  const common = { ...cookieCommon(), httpOnly: true };
  res.cookies.set(ACCESS, access, { ...common, maxAge: 60 * 60 });
  res.cookies.set(REFRESH, refresh, { ...common, maxAge: 60 * 60 * 24 * 14 });
  setCsrfCookie(res);
}

/** Non-HttpOnly double-submit token (readable by JS). SameSite=Lax is primary CSRF defense. */
export function setCsrfCookie(res: NextResponse, token?: string) {
  if (!authCookiesEnabled()) return;
  const value = token || randomBytes(24).toString("hex");
  res.cookies.set(CSRF, value, {
    ...cookieCommon(),
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 14,
  });
}

export function clearAuthCookies(res: NextResponse) {
  const base = { path: "/", maxAge: 0 };
  res.cookies.set(ACCESS, "", { httpOnly: true, ...base });
  res.cookies.set(REFRESH, "", { httpOnly: true, ...base });
  res.cookies.set(CSRF, "", { ...base });
}

/**
 * Double-submit CSRF for cookie-session mutating BFF routes.
 * Skipped when cookies mode is off, or when no auth cookies are present (e.g. first login).
 * Uses timing-safe compare + optional Origin/Referer allowlist (VBX_PUBLIC_URL / CORS).
 */
export function requireCsrf(req: NextRequest): NextResponse | null {
  if (!authCookiesEnabled()) return null;
  const hasSession = !!(req.cookies.get(ACCESS)?.value || req.cookies.get(REFRESH)?.value);
  if (!hasSession) return null;
  const cookie = req.cookies.get(CSRF)?.value || "";
  const header = req.headers.get("x-csrf-token") || "";
  if (!cookie || !header || !timingSafeEqualStr(cookie, header)) {
    return NextResponse.json({ detail: "CSRF token missing or invalid" }, { status: 403 });
  }
  if (!originAllowed(req)) {
    return NextResponse.json({ detail: "CSRF origin not allowed" }, { status: 403 });
  }
  return null;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

function originAllowed(req: NextRequest): boolean {
  const origin = (req.headers.get("origin") || "").trim();
  const referer = (req.headers.get("referer") || "").trim();
  if (!origin && !referer) return true;
  const allowed = new Set<string>();
  const publicUrl = (process.env.VBX_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (publicUrl) allowed.add(publicUrl);
  for (const part of (process.env.VBX_CORS_ORIGINS || "").split(",")) {
    const o = part.trim().replace(/\/$/, "");
    if (o) allowed.add(o);
  }
  if (allowed.size === 0) return true;
  const candidates: string[] = [];
  if (origin) candidates.push(origin.replace(/\/$/, ""));
  if (referer) {
    try {
      const u = new URL(referer);
      candidates.push(`${u.protocol}//${u.host}`);
    } catch {
      /* ignore */
    }
  }
  return candidates.some((c) => allowed.has(c));
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
