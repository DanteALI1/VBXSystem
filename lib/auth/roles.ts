import type { UserRole } from "@/db/schema";

export type AppRole = UserRole;

export const APP_ROLES: readonly AppRole[] = [
  "admin",
  "analyst",
  "viewer",
] as const;

export type SessionLike = {
  user: {
    role?: string | null;
  };
} | null;

export class AuthError extends Error {
  readonly status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/** Ensure the session user has one of the allowed roles. */
export function requireRole(
  session: SessionLike,
  roles: readonly AppRole[],
): AppRole {
  if (!session?.user) {
    throw new AuthError("Unauthorized", 401);
  }

  const role = session.user.role as AppRole | undefined;
  if (!role || !roles.includes(role)) {
    throw new AuthError("Forbidden", 403);
  }

  return role;
}

export function canTriggerSync(role: AppRole): boolean {
  return role === "admin";
}

export function canManageAllowlist(role: AppRole): boolean {
  return role === "admin";
}

export function canChangeFindingStatus(role: AppRole): boolean {
  return role === "analyst" || role === "admin";
}

export function canCreateScan(role: AppRole): boolean {
  return role === "analyst" || role === "admin";
}

export function isViewer(role: AppRole): boolean {
  return role === "viewer";
}
