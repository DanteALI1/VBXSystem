export function severityTone(
  severity?: string | null,
): "neutral" | "ok" | "warn" | "danger" | "accent" {
  const s = (severity || "").toUpperCase();
  if (s.includes("CRIT") || s.includes("КРИТ")) return "danger";
  if (s.includes("HIGH") || s.includes("ВЫСОК")) return "danger";
  if (s.includes("MED") || s.includes("СРЕД")) return "warn";
  if (s.includes("LOW") || s.includes("НИЗ")) return "ok";
  return "neutral";
}

export function formatEpss(epss?: { score?: number; percentile?: number } | null): string {
  if (!epss || epss.score == null) return "";
  const pct = epss.percentile != null ? ` · p${Math.round(epss.percentile * 100)}` : "";
  return `${(epss.score * 100).toFixed(1)}%${pct}`;
}

export function formatDate(v?: string | null): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("ru-RU");
  } catch {
    return v;
  }
}
