import { eq } from "drizzle-orm";
import { db } from "@/db";
import { allowlistTargets } from "@/db/schema";
import { targetsAllowed, type AllowlistEntry } from "@/lib/allowlist/matcher";
import { ALLOWLIST_REJECTED } from "./types";

export class AllowlistRejectedError extends Error {
  readonly code = ALLOWLIST_REJECTED;
  readonly rejected: string[];

  constructor(rejected: string[]) {
    super(
      `Scan targets outside enabled allowlist: ${rejected.join(", ")}`,
    );
    this.name = "AllowlistRejectedError";
    this.rejected = rejected;
  }
}

export async function loadEnabledAllowlist(): Promise<AllowlistEntry[]> {
  const rows = await db
    .select({
      pattern: allowlistTargets.pattern,
      patternType: allowlistTargets.patternType,
      enabled: allowlistTargets.enabled,
    })
    .from(allowlistTargets)
    .where(eq(allowlistTargets.enabled, true));
  return rows;
}

/**
 * Enforce targets ⊆ enabled allowlist. Throws AllowlistRejectedError otherwise.
 * Call before enqueue and again in the worker before starting any binary.
 */
export async function assertTargetsAllowed(targets: string[]): Promise<void> {
  const allowlist = await loadEnabledAllowlist();
  const result = targetsAllowed(targets, allowlist);
  if (!result.ok) {
    throw new AllowlistRejectedError(result.rejected);
  }
}
