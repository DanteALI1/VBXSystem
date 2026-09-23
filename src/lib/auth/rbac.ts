import { headers } from "next/headers";
import { auth, type Session, type SessionUser } from "./auth";

export type UserRole = "admin" | "analyst" | "viewer";

export const ROLE_RANK: Record<UserRole, number> = {
  viewer: 1,
  analyst: 2,
  admin: 3,
};

/** Permissions used by server routes / UI gates (contracts Wave 1). */
export const PERMISSIONS = {
  read: ["viewer", "analyst", "admin"] as const satisfies readonly UserRole[],
  /** scans enqueue + finding status + tags */
  analystWrite: ["analyst", "admin"] as const satisfies readonly UserRole[],
  /** sync settings, allowlist mutate, users, bootstrap policies */
  adminOnly: ["admin"] as const satisfies readonly UserRole[],
} as const;

export function isUserRole(value: unknown): value is UserRole {
  return value === "admin" || value === "analyst" || value === "viewer";
}

export function getUserRole(user: SessionUser | Session["user"] | null | undefined): UserRole {
  const role = (user as SessionUser | undefined)?.role;
  return isUserRole(role) ? role : "viewer";
}

export function hasRole(role: UserRole, allowed: readonly UserRole[]): boolean {
  return allowed.includes(role);
}

export function hasMinRole(role: UserRole, minimum: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Load session from request cookies (RSC / route handlers). */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Require an authenticated session; throws AuthError 401. */
export async function requireSession() {
  const session = await getSession();
  if (!session?.user) {
    throw new AuthError("Unauthorized", 401);
  }
  return session;
}

/** Require one of the allowed roles; throws 401/403. */
export async function requireRole(...allowed: UserRole[]) {
  const session = await requireSession();
  const role = getUserRole(session.user);
  if (!hasRole(role, allowed)) {
    throw new AuthError("Forbidden", 403);
  }
  return { session, role };
}

export async function requireMinRole(minimum: UserRole) {
  const session = await requireSession();
  const role = getUserRole(session.user);
  if (!hasMinRole(role, minimum)) {
    throw new AuthError("Forbidden", 403);
  }
  return { session, role };
}

/** Map AuthError to a Response for route handlers. */
export function authErrorResponse(err: unknown): Response | null {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return null;
}
