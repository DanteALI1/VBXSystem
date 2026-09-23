/** Finding lifecycle statuses (matches DB enum `finding_status`). */
export const FINDING_STATUSES = [
  "open",
  "fixed",
  "accepted",
  "false_positive",
] as const;

export type FindingStatus = (typeof FINDING_STATUSES)[number];

export function isFindingStatus(value: unknown): value is FindingStatus {
  return (
    typeof value === "string" &&
    (FINDING_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Allowed transitions: any status → any other status.
 * Same-status PATCH is a no-op (allowed). Unknown status rejected by schema.
 */
export function canTransitionStatus(
  from: FindingStatus,
  to: FindingStatus,
): boolean {
  void from;
  void to;
  return true;
}
