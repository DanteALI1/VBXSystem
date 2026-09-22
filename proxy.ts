import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic session-cookie gate for /app/** and /login.
 * Always re-validate the session on the server for protected actions.
 *
 * Next.js 16: `proxy.ts` replaces the deprecated `middleware.ts` convention.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);

  if (pathname.startsWith("/app")) {
    if (!sessionCookie) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  if (pathname === "/login" || pathname.startsWith("/login/")) {
    if (sessionCookie) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/login"],
};
