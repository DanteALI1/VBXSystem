/**
 * Single source of truth for Search UI labels.
 * Columns and filters must use these names — no drift.
 *
 * Naming rule: affected.version = versions of the APPLICATION (ПО), never OS.
 * OS versions belong with ОС if/when extracted separately.
 */

export const FIELD_LABELS = {
  id: "CVE",
  "bdu.id": "BDU",
  has_bdu: "Есть BDU",
  "affected.app": "ПО",
  "affected.os": "ОС",
  /** Always application/product versions — not OS */
  "affected.version": "Версия ПО",
  severity: "Критичность",
  cvss_score: "CVSS",
  "epss_scores.score": "EPSS",
  published: "Опубликовано",
  modified: "Изменено",
  status: "Статус",
  source: "Источник",
  title: "Заголовок",
  description: "Описание",
  is_cisa_kev: "KEV",
  is_remote: "Remote",
  "products.vendor.name": "Vendor / Product",
  /** Combined flags column (KEV + Remote) */
  flags: "Флаги",
  vector: "Вектор",
  cwe: "CWE",
} as const;

/** Longer tooltips for column headers / filter picker */
export const FIELD_HINTS: Partial<Record<keyof typeof FIELD_LABELS, string>> = {
  "affected.app": "Уязвимое приложение / продукт (не ОС)",
  "affected.os": "Операционная система из CPE / описания",
  "affected.version":
    "Диапазон версий уязвимого ПО (приложение). Не относится к колонке ОС.",
  severity: "Уровень критичности (CRITICAL / HIGH / …)",
  cvss_score: "Числовая оценка CVSS 0–10",
  "epss_scores.score": "Вероятность эксплуатации (EPSS), в UI — проценты 0–100%",
  published: "Дата публикации в NVD",
  modified: "Дата последнего изменения в NVD",
  has_bdu: "Есть связанная запись БДУ ФСТЭК",
  is_cisa_kev: "В каталоге CISA KEV",
  is_remote: "Удалённая эксплуатация (по вектору / эвристике)",
};

export type FieldLabelKey = keyof typeof FIELD_LABELS;

export function fieldLabel(key: string, fallback?: string): string {
  return (FIELD_LABELS as Record<string, string>)[key] || fallback || key;
}

export function fieldHint(key: string): string | undefined {
  return (FIELD_HINTS as Record<string, string | undefined>)[key];
}
