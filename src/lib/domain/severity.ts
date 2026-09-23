export type Severity = "none" | "low" | "medium" | "high" | "critical";

const ORDER: Record<Severity, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * NVD CVSS v3 qualitative scale.
 * 0 = None; 0.1–3.9 Low; 4–6.9 Medium; 7–8.9 High; 9–10 Critical.
 * null/undefined → null (no score).
 */
export function severityFromCvss(score: number | null | undefined): Severity | null {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return null;
  }
  if (score <= 0) return "none";
  if (score <= 3.9) return "low";
  if (score <= 6.9) return "medium";
  if (score <= 8.9) return "high";
  return "critical";
}

/** Pick the more critical severity (for NVD vs BDU disagreement). */
export function maxSeverity(
  a: Severity | null | undefined,
  b: Severity | null | undefined,
): Severity | null {
  if (!a && !b) return null;
  if (!a) return b ?? null;
  if (!b) return a;
  return ORDER[a] >= ORDER[b] ? a : b;
}

export function maxCvss(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.max(a, b);
}
