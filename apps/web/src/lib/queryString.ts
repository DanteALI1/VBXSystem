/** Build a query string from a plain object (skips empty/null/undefined). */
export function buildQs(
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) continue;
      sp.set(key, trimmed);
      continue;
    }
    if (typeof value === "boolean") {
      if (value) sp.set(key, "true");
      continue;
    }
    sp.set(key, String(value));
  }
  return sp.toString();
}
