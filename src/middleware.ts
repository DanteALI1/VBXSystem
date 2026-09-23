import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Cookie-existence gate for optimistic redirects.
 * Always re-validate session in server components / route handlers.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);
  const isAuthed = Boolean(sessionCookie);

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  if (pathname === "/login" || pathname.startsWith("/login/")) {
    if (isAuthed) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/app" || pathname.startsWith("/app/")) {
    if (!isAuthed) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/login", "/login/:path*", "/api/auth/:path*"],
};
