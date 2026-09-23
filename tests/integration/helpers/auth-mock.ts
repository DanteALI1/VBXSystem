import { authState, type TestRole } from "./vitest-setup";

export { authState };
export type { TestRole };

export function asRole(role: TestRole, userId?: string) {
  authState.role = role;
  if (userId) authState.userId = userId;
}

export async function jsonOf(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}
