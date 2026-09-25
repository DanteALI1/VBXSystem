/** CVSS v3.x vector parsing and metric catalogs (cvefeed-style scoring details). */

export type CvssMetricKey = "AV" | "AC" | "PR" | "UI" | "S" | "C" | "I" | "A";

export type CvssMetricDef = {
  key: CvssMetricKey;
  label: string;
  labelRu: string;
  options: { value: string; label: string; weight: number }[];
};

export const CVSS_METRICS: CvssMetricDef[] = [
  {
    key: "AV",
    label: "Attack Vector",
    labelRu: "Вектор атаки",
    options: [
      { value: "N", label: "Network", weight: 3 },
      { value: "A", label: "Adjacent", weight: 2 },
      { value: "L", label: "Local", weight: 1 },
      { value: "P", label: "Physical", weight: 0 },
    ],
  },
  {
    key: "AC",
    label: "Attack Complexity",
    labelRu: "Сложность атаки",
    options: [
      { value: "L", label: "Low", weight: 3 },
      { value: "H", label: "High", weight: 1 },
    ],
  },
  {
    key: "PR",
    label: "Privileges Required",
    labelRu: "Требуемые привилегии",
    options: [
      { value: "N", label: "None", weight: 3 },
      { value: "L", label: "Low", weight: 2 },
      { value: "H", label: "High", weight: 1 },
    ],
  },
  {
    key: "UI",
    label: "User Interaction",
    labelRu: "Взаимодействие с пользователем",
    options: [
      { value: "N", label: "None", weight: 3 },
      { value: "R", label: "Required", weight: 1 },
    ],
  },
  {
    key: "S",
    label: "Scope",
    labelRu: "Область воздействия",
    options: [
      { value: "U", label: "Unchanged", weight: 1 },
      { value: "C", label: "Changed", weight: 3 },
    ],
  },
  {
    key: "C",
    label: "Confidentiality Impact",
    labelRu: "Конфиденциальность",
    options: [
      { value: "H", label: "High", weight: 3 },
      { value: "L", label: "Low", weight: 1 },
      { value: "N", label: "None", weight: 0 },
    ],
  },
  {
    key: "I",
    label: "Integrity Impact",
    labelRu: "Целостность",
    options: [
      { value: "H", label: "High", weight: 3 },
      { value: "L", label: "Low", weight: 1 },
      { value: "N", label: "None", weight: 0 },
    ],
  },
  {
    key: "A",
    label: "Availability Impact",
    labelRu: "Доступность",
    options: [
      { value: "H", label: "High", weight: 3 },
      { value: "L", label: "Low", weight: 1 },
      { value: "N", label: "None", weight: 0 },
    ],
  },
];

export type ParsedCvss = {
  version: string;
  metrics: Partial<Record<CvssMetricKey, string>>;
};

export function parseCvssVector(vector?: string | null): ParsedCvss | null {
  if (!vector || !vector.trim()) return null;
  let raw = vector.trim();
  // BDU often stores metric-only strings without CVSS:3.x/ prefix
  if (!/^CVSS/i.test(raw) && /(?:^|\/)AV:/.test(raw)) {
    raw = `CVSS:3.1/${raw.replace(/^\//, "")}`;
  }
  const parts = raw.split("/");
  let version = "";
  const metrics: Partial<Record<CvssMetricKey, string>> = {};
  for (const part of parts) {
    const [k, v] = part.split(":");
    if (!k || v == null) continue;
    if (k.startsWith("CVSS")) {
      version = v || k.replace("CVSS", "");
      continue;
    }
    if (["AV", "AC", "PR", "UI", "S", "C", "I", "A"].includes(k)) {
      metrics[k as CvssMetricKey] = v;
    }
  }
  if (!Object.keys(metrics).length) return null;
  return { version: version || "3.1", metrics };
}

export function metricWeights(parsed: ParsedCvss | null): number[] {
  return CVSS_METRICS.map((m) => {
    const val = parsed?.metrics[m.key];
    const opt = m.options.find((o) => o.value === val);
    return opt?.weight ?? 0;
  });
}

export function optionLabel(metric: CvssMetricDef, value?: string): string {
  return metric.options.find((o) => o.value === value)?.label || value || "—";
}
