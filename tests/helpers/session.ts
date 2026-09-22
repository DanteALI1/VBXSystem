import type { AppRole } from "@/lib/auth/roles";

/** Minimal session shape returned by `getSession` for API route tests. */
export function sessionFor(role: AppRole | null) {
  if (!role) return null;
  return {
    user: {
      id: `test-${role}`,
      email: `${role}@test.local`,
      role,
    },
    session: { id: `sess-${role}` },
  };
}
