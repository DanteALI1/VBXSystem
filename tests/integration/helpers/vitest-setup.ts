/**
 * Vitest setup — force test DB + mock RBAC for route-handler integration tests.
 */
import { vi } from "vitest";

process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  "postgresql://vuln:vuln@localhost:5432/vuln_test";
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret";

export type TestRole = "admin" | "analyst" | "viewer";

export const authState = {
  role: "admin" as TestRole,
  userId: "tc-test-user-admin",
};

vi.mock("@/lib/auth/rbac", () => {
  class AuthError extends Error {
    status: 401 | 403;
    constructor(message: string, status: 401 | 403 = 401) {
      super(message);
      this.name = "AuthError";
      this.status = status;
    }
  }

  const ROLE_RANK: Record<TestRole, number> = {
    viewer: 1,
    analyst: 2,
    admin: 3,
  };

  return {
    AuthError,
    ROLE_RANK,
    PERMISSIONS: {
      read: ["viewer", "analyst", "admin"] as const,
      analystWrite: ["analyst", "admin"] as const,
      adminOnly: ["admin"] as const,
    },
    isUserRole: (v: unknown) =>
      v === "admin" || v === "analyst" || v === "viewer",
    getUserRole: (user: { role?: string } | null | undefined) =>
      (user?.role as TestRole) ?? "viewer",
    hasRole: (role: TestRole, allowed: readonly TestRole[]) =>
      allowed.includes(role),
    hasMinRole: (role: TestRole, minimum: TestRole) =>
      ROLE_RANK[role] >= ROLE_RANK[minimum],
    requireSession: async () => ({
      user: {
        id: authState.userId,
        email: `${authState.role}@test.local`,
        role: authState.role,
      },
      session: { id: "sess" },
    }),
    requireRole: async (...allowed: TestRole[]) => {
      if (!allowed.includes(authState.role)) {
        throw new AuthError("Forbidden", 403);
      }
      return {
        session: {
          user: {
            id: authState.userId,
            email: `${authState.role}@test.local`,
            role: authState.role,
          },
        },
        role: authState.role,
      };
    },
    requireMinRole: async (minimum: TestRole) => {
      if (ROLE_RANK[authState.role] < ROLE_RANK[minimum]) {
        throw new AuthError("Forbidden", 403);
      }
      return {
        session: {
          user: {
            id: authState.userId,
            email: `${authState.role}@test.local`,
            role: authState.role,
          },
        },
        role: authState.role,
      };
    },
    authErrorResponse: (err: unknown) => {
      if (err instanceof AuthError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      return null;
    },
    getSession: async () => ({
      user: {
        id: authState.userId,
        email: `${authState.role}@test.local`,
        role: authState.role,
      },
    }),
  };
});
