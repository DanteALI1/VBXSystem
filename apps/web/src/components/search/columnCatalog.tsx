import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatDate, severityTone } from "@/lib/severity";
import { FIELD_LABELS, FIELD_HINTS } from "./fieldLabels";

export type SearchHit = {
  id: string;
  title: string;
  severity: string;
  cvss_score?: number | null;
  cvss_version?: string;
  cvss_vector?: string;
  published?: string | null;
  modified?: string | null;
  description: string;
  status?: string;
  source?: string;
  is_cisa_kev: boolean;
  has_bdu: boolean;
  is_remote?: boolean | null;
  cwes?: string[];
  products?: string[];
  bdu_ids?: string[];
  epss_score?: number | null;
  epss_percentile?: number | null;
  affected_app?: string;
  affected_os?: string;
  affected_version?: string;
  affected_apps?: string[];
  affected_oses?: string[];
  affected_versions?: string[];
  href: string;
};

export type ColumnId =
  | "cve"
  | "bdu"
  | "app"
  | "os"
  | "version"
  | "severity"
  | "cvss"
  | "vector"
  | "epss"
  | "published"
  | "modified"
  | "status"
  | "source"
  | "cwe"
  | "flags"
  | "title"
  | "description";

export type ColumnDef = {
  id: ColumnId;
  label: string;
  description: string;
  defaultWidth: number;
  minWidth: number;
  defaultVisible: boolean;
};

export type ColumnState = {
  id: ColumnId;
  visible: boolean;
  width: number;
};

export type RowDensity = "compact" | "normal" | "comfortable";

export type TableViewState = {
  columns: ColumnState[];
  rowDensity: RowDensity;
};

export const COLUMN_CATALOG: ColumnDef[] = [
  {
    id: "cve",
    label: FIELD_LABELS.id,
    description: "Идентификатор CVE",
    defaultWidth: 150,
    minWidth: 110,
    defaultVisible: true,
  },
  {
    id: "bdu",
    label: FIELD_LABELS["bdu.id"],
    description: "Связанные записи БДУ ФСТЭК",
    defaultWidth: 140,
    minWidth: 100,
    defaultVisible: true,
  },
  {
    id: "app",
    label: FIELD_LABELS["affected.app"],
    description: FIELD_HINTS["affected.app"] || "Уязвимое приложение",
    defaultWidth: 140,
    minWidth: 90,
    defaultVisible: true,
  },
  {
    id: "os",
    label: FIELD_LABELS["affected.os"],
    description: FIELD_HINTS["affected.os"] || "Операционная система",
    defaultWidth: 100,
    minWidth: 70,
    defaultVisible: true,
  },
  {
    id: "version",
    label: FIELD_LABELS["affected.version"],
    description: FIELD_HINTS["affected.version"] || "Версии уязвимого ПО",
    defaultWidth: 140,
    minWidth: 90,
    defaultVisible: true,
  },
  {
    id: "severity",
    label: FIELD_LABELS.severity,
    description: FIELD_HINTS.severity || "Критичность",
    defaultWidth: 110,
    minWidth: 80,
    defaultVisible: true,
  },
  {
    id: "cvss",
    label: FIELD_LABELS.cvss_score,
    description: FIELD_HINTS.cvss_score || "Оценка CVSS",
    defaultWidth: 90,
    minWidth: 70,
    defaultVisible: true,
  },
  {
    id: "vector",
    label: FIELD_LABELS.vector,
    description: "CVSS vector string",
    defaultWidth: 160,
    minWidth: 100,
    defaultVisible: false,
  },
  {
    id: "epss",
    label: FIELD_LABELS["epss_scores.score"],
    description: FIELD_HINTS["epss_scores.score"] || "Exploit Prediction",
    defaultWidth: 90,
    minWidth: 70,
    defaultVisible: true,
  },
  {
    id: "published",
    label: FIELD_LABELS.published,
    description: FIELD_HINTS.published || "Дата публикации",
    defaultWidth: 130,
    minWidth: 100,
    defaultVisible: true,
  },
  {
    id: "modified",
    label: FIELD_LABELS.modified,
    description: FIELD_HINTS.modified || "Дата изменения",
    defaultWidth: 130,
    minWidth: 100,
    defaultVisible: false,
  },
  {
    id: "status",
    label: FIELD_LABELS.status,
    description: "Статус записи NVD",
    defaultWidth: 100,
    minWidth: 80,
    defaultVisible: true,
  },
  {
    id: "source",
    label: FIELD_LABELS.source,
    description: "Источник записи",
    defaultWidth: 80,
    minWidth: 60,
    defaultVisible: false,
  },
  {
    id: "cwe",
    label: FIELD_LABELS.cwe,
    description: "CWE identifiers",
    defaultWidth: 110,
    minWidth: 70,
    defaultVisible: true,
  },
  {
    id: "flags",
    label: FIELD_LABELS.flags,
    description: `${FIELD_LABELS.is_cisa_kev} / ${FIELD_LABELS.is_remote}`,
    defaultWidth: 120,
    minWidth: 80,
    defaultVisible: true,
  },
  {
    id: "title",
    label: FIELD_LABELS.title,
    description: "Заголовок",
    defaultWidth: 180,
    minWidth: 100,
    defaultVisible: false,
  },
  {
    id: "description",
    label: FIELD_LABELS.description,
    description: "Краткое описание",
    defaultWidth: 240,
    minWidth: 120,
    defaultVisible: false,
  },
];

export const STORAGE_KEY = "vbx.search.tableView.v1";

export function defaultViewState(): TableViewState {
  return {
    columns: COLUMN_CATALOG.map((c) => ({
      id: c.id,
      visible: c.defaultVisible,
      width: c.defaultWidth,
    })),
    rowDensity: "normal",
  };
}

export function loadViewState(): TableViewState {
  if (typeof window === "undefined") return defaultViewState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultViewState();
    const parsed = JSON.parse(raw) as Partial<TableViewState>;
    const byId = new Map((parsed.columns || []).map((c) => [c.id, c]));
    const columns = COLUMN_CATALOG.map((c) => {
      const prev = byId.get(c.id);
      return {
        id: c.id,
        visible: prev?.visible ?? c.defaultVisible,
        width: Math.max(c.minWidth, prev?.width ?? c.defaultWidth),
      };
    });
    // Keep user order if present
    const order = (parsed.columns || []).map((c) => c.id).filter(Boolean);
    if (order.length) {
      columns.sort((a, b) => {
        const ia = order.indexOf(a.id);
        const ib = order.indexOf(b.id);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });
    }
    const density = parsed.rowDensity;
    return {
      columns,
      rowDensity:
        density === "compact" || density === "comfortable" || density === "normal"
          ? density
          : "normal",
    };
  } catch {
    return defaultViewState();
  }
}

export function saveViewState(state: TableViewState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function catalogById(id: ColumnId): ColumnDef {
  return COLUMN_CATALOG.find((c) => c.id === id)!;
}

export function densityClass(d: RowDensity): string {
  if (d === "compact") return "text-xs [&_td]:py-1 [&_th]:py-1";
  if (d === "comfortable") return "text-sm [&_td]:py-3 [&_th]:py-2.5";
  return "text-sm [&_td]:py-2 [&_th]:py-2";
}

export function renderCell(col: ColumnId, r: SearchHit): ReactNode {
  switch (col) {
    case "cve":
      return (
        <Link
          href={r.href}
          className="text-accent2 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {r.id}
        </Link>
      );
    case "bdu":
      if (!r.bdu_ids?.length) return <span className="text-muted">—</span>;
      return (
        <div className="flex flex-col gap-0.5">
          {r.bdu_ids.slice(0, 3).map((id) => (
            <Link
              key={id}
              href={`/bdu/${encodeURIComponent(id)}`}
              className="font-mono text-[11px] text-accent2 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {id}
            </Link>
          ))}
          {r.bdu_ids.length > 3 ? (
            <span className="text-[10px] text-muted">+{r.bdu_ids.length - 3}</span>
          ) : null}
        </div>
      );
    case "app": {
      const name = r.affected_app || r.affected_apps?.[0] || "";
      const extra = (r.affected_apps?.length || 0) > 1 ? ` +${r.affected_apps!.length - 1}` : "";
      return name ? (
        <span title="Уязвимое приложение / продукт">
          {name}
          {extra ? <span className="text-muted">{extra}</span> : null}
        </span>
      ) : (
        <span className="text-muted">—</span>
      );
    }
    case "os":
      return (
        <span title="Операционная система">
          {r.affected_os || r.affected_oses?.join(", ") || <span className="text-muted">—</span>}
        </span>
      );
    case "version": {
      const ver = r.affected_version || r.affected_versions?.slice(0, 2).join("; ") || "";
      const app = r.affected_app || r.affected_apps?.[0];
      if (!ver) return <span className="text-muted">—</span>;
      return (
        <span
          className="font-mono text-[11px]"
          title={
            app
              ? `Версии уязвимого ПО «${app}» (не ОС)`
              : "Версии уязвимого приложения / продукта (не ОС)"
          }
        >
          {ver}
          {(r.affected_versions?.length || 0) > 2 ? (
            <span className="text-muted"> +{r.affected_versions!.length - 2}</span>
          ) : null}
        </span>
      );
    }
    case "severity":
      return r.severity ? <Badge tone={severityTone(r.severity)}>{r.severity}</Badge> : "—";
    case "cvss":
      return (
        <>
          {r.cvss_score ?? "—"}
          {r.cvss_version ? <span className="ml-1 text-[10px] text-muted">v{r.cvss_version}</span> : null}
        </>
      );
    case "vector":
      return <span className="font-mono text-[10px] text-muted">{r.cvss_vector || "—"}</span>;
    case "epss":
      return r.epss_score != null ? `${(r.epss_score * 100).toFixed(1)}%` : "—";
    case "published":
      return <span className="text-xs text-muted">{formatDate(r.published)}</span>;
    case "modified":
      return <span className="text-xs text-muted">{formatDate(r.modified)}</span>;
    case "status":
      return r.status || "—";
    case "source":
      return r.source || "—";
    case "cwe":
      return <span className="font-mono text-[10px] text-muted">{(r.cwes || []).join(", ") || "—"}</span>;
    case "flags":
      return (
        <div className="flex flex-wrap gap-1">
          {r.is_cisa_kev && <Badge tone="warn">KEV</Badge>}
          {r.has_bdu && <Badge tone="accent">BDU</Badge>}
          {r.is_remote && <Badge tone="neutral">remote</Badge>}
          {!r.is_cisa_kev && !r.has_bdu && !r.is_remote ? "—" : null}
        </div>
      );
    case "title":
      return <span className="line-clamp-2 text-xs text-muted">{r.title || "—"}</span>;
    case "description":
      return <span className="line-clamp-2 text-xs text-muted">{r.description || "—"}</span>;
    default:
      return "—";
  }
}
