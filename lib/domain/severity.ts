import type { Severity } from "@/db/schema";

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
  unknown: 0,
};

const ALIASES: Record<string, Severity> = {
  critical: "critical",
  crit: "critical",
  high: "high",
  medium: "medium",
  med: "medium",
  moderate: "medium",
  low: "low",
  info: "info",
  informational: "info",
  none: "info",
  unknown: "unknown",
  "": "unknown",
};

/** Normalize arbitrary severity labels to the domain enum. */
export function parseSeverity(input: string | null | undefined): Severity {
  if (input == null) return "unknown";
  const key = input.trim().toLowerCase();
  return ALIASES[key] ?? "unknown";
}

/** Compare two severities; positive if a > b. */
export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_ORDER[a] - SEVERITY_ORDER[b];
}

export function severityRank(severity: Severity): number {
  return SEVERITY_ORDER[severity];
}

export function isAtLeast(severity: Severity, minimum: Severity): boolean {
  return compareSeverity(severity, minimum) >= 0;
}

export { SEVERITY_ORDER };
