import type { FindingStatus } from "@/db/schema";
import type { AppRole } from "@/lib/auth/roles";
import { AuthError } from "@/lib/auth/roles";

/**
 * Allowed status transitions (findings.md).
 * - open → fixed | accepted | false_positive (analyst, admin)
 * - fixed → open (analyst, admin)
 * - accepted | false_positive → open (admin only)
 */
const TRANSITIONS: Record<
  FindingStatus,
  Partial<Record<FindingStatus, readonly AppRole[]>>
> = {
  open: {
    fixed: ["analyst", "admin"],
    accepted: ["analyst", "admin"],
    false_positive: ["analyst", "admin"],
  },
  fixed: {
    open: ["analyst", "admin"],
  },
  accepted: {
    open: ["admin"],
  },
  false_positive: {
    open: ["admin"],
  },
};

export class FindingTransitionError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "FindingTransitionError";
  }
}

export function assertFindingStatusTransition(
  from: FindingStatus,
  to: FindingStatus,
  role: AppRole,
): void {
  if (from === to) {
    throw new FindingTransitionError(`Finding is already "${to}"`);
  }

  const allowedRoles = TRANSITIONS[from]?.[to];
  if (!allowedRoles) {
    throw new FindingTransitionError(
      `Transition from "${from}" to "${to}" is not allowed`,
    );
  }

  if (!allowedRoles.includes(role)) {
    throw new AuthError(
      `Role "${role}" cannot transition from "${from}" to "${to}"`,
      403,
    );
  }
}

/** Statuses the role may set from the current status (for UI selects). */
export function allowedFindingStatuses(
  from: FindingStatus,
  role: AppRole,
): FindingStatus[] {
  const targets = TRANSITIONS[from] ?? {};
  return (Object.keys(targets) as FindingStatus[]).filter((to) =>
    targets[to]?.includes(role),
  );
}
