"use client";

import { useCallback, useRef, type MouseEvent as ReactMouseEvent } from "react";
import {
  ColumnState,
  SearchHit,
  TableViewState,
  catalogById,
  densityClass,
  renderCell,
} from "@/components/search/columnCatalog";
import { Card } from "@/components/ui/Card";

type Props = {
  rows: SearchHit[];
  view: TableViewState;
  onChange: (next: TableViewState) => void;
  selectedId?: string | null;
  onSelect: (row: SearchHit) => void;
  empty?: boolean;
};

export function ResultsTable({ rows, view, onChange, selectedId, onSelect, empty }: Props) {
  const visible = view.columns.filter((c) => c.visible);
  const resizing = useRef<{ id: string; startX: number; startW: number } | null>(null);

  const onResizeMove = useCallback(
    (e: MouseEvent) => {
      const r = resizing.current;
      if (!r) return;
      const meta = catalogById(r.id as ColumnState["id"]);
      const nextW = Math.max(meta.minWidth, Math.min(480, r.startW + (e.clientX - r.startX)));
      onChange({
        ...view,
        columns: view.columns.map((c) => (c.id === r.id ? { ...c, width: nextW } : c)),
      });
    },
    [onChange, view],
  );

  const onResizeEnd = useCallback(() => {
    resizing.current = null;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", onResizeEnd);
  }, [onResizeMove]);

  function startResize(id: string, e: ReactMouseEvent, width: number) {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = { id, startX: e.clientX, startW: width };
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", onResizeEnd);
  }

  const minWidth = visible.reduce((s, c) => s + c.width, 0);

  return (
    <Card className="overflow-hidden p-0" data-testid="cveql-results">
      <div className="overflow-x-auto">
        <table
          className={`vbx-results-table w-full text-left ${densityClass(view.rowDensity)}`}
          style={{ minWidth }}
        >
          <thead className="sticky top-0 z-10 bg-surface2 text-xs text-muted">
            <tr>
              {visible.map((c) => {
                const meta = catalogById(c.id);
                return (
                  <th
                    key={c.id}
                    className="relative px-3 font-medium"
                    style={{ width: c.width, minWidth: c.width, maxWidth: c.width }}
                    title={meta.description}
                  >
                    <span className="pr-2">{meta.label}</span>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      title="Изменить ширину"
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-accent/50"
                      onMouseDown={(e) => startResize(c.id, e, c.width)}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`cursor-pointer border-t border-border/70 align-top hover:bg-surface2/60 ${
                  selectedId === r.id ? "bg-accent/10" : ""
                } ${r.is_cisa_kev ? "vbx-row-kev" : ""}`}
                onClick={() => onSelect(r)}
              >
                {visible.map((c) => (
                  <td
                    key={c.id}
                    className="overflow-hidden px-3"
                    style={{ width: c.width, minWidth: c.width, maxWidth: c.width }}
                  >
                    <div className="truncate">{renderCell(c.id, r)}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {empty && <p className="p-4 text-sm text-muted">Пустой результат.</p>}
      </div>
    </Card>
  );
}
