import type { AllowlistTarget } from "@/db/schema";
import type { AllowlistListItem } from "./types";

export function serializeAllowlistTarget(
  row: AllowlistTarget,
): AllowlistListItem {
  return {
    id: row.id,
    pattern: row.pattern,
    type: row.type,
    enabled: row.enabled,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
