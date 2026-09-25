"use client";

import { useMemo, useState } from "react";
import GridLayout, { Layout, WidthProvider } from "react-grid-layout";
import { X } from "lucide-react";
import { DashboardWidget } from "./widgets";
import type { DashboardData, LayoutWidget, WidgetType } from "./types";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ReactGridLayout = WidthProvider(GridLayout);

const RESIZE_HANDLES: Array<"s" | "e" | "se"> = ["s", "e", "se"];

type Props = {
  widgets: LayoutWidget[];
  data: DashboardData | null;
  range: string;
  onRange: (r: string) => void;
  editing: boolean;
  onWidgetsChange: (next: LayoutWidget[]) => void;
};

export function DashboardCanvas({
  widgets,
  data,
  range,
  onRange,
  editing,
  onWidgetsChange,
}: Props) {
  const [resizingId, setResizingId] = useState<string | null>(null);

  const layout: Layout[] = useMemo(
    () =>
      widgets.map((w) => ({
        i: w.i,
        x: w.x,
        y: w.y,
        w: w.w,
        h: w.h,
        minW: w.minW ?? 2,
        minH: w.minH ?? 2,
        maxW: 12,
        static: !editing,
        isResizable: editing,
        isDraggable: editing,
        resizeHandles: editing ? RESIZE_HANDLES : undefined,
      })),
    [widgets, editing],
  );

  function mergeLayout(next: Layout[]) {
    const byId = new Map(widgets.map((w) => [w.i, w]));
    return next.map((n) => {
      const prev = byId.get(n.i);
      return {
        i: n.i,
        type: (prev?.type || n.i) as WidgetType,
        x: n.x,
        y: n.y,
        w: n.w,
        h: n.h,
        minW: prev?.minW ?? n.minW ?? 2,
        minH: prev?.minH ?? n.minH ?? 2,
      };
    });
  }

  function onLayoutChange(next: Layout[]) {
    if (!editing) return;
    const merged = mergeLayout(next);
    const changed = merged.some((m, idx) => {
      const p = widgets[idx];
      if (!p || p.i !== m.i) return true;
      return p.x !== m.x || p.y !== m.y || p.w !== m.w || p.h !== m.h;
    });
    if (!changed && merged.length === widgets.length) return;
    onWidgetsChange(merged);
  }

  function removeWidget(id: string) {
    onWidgetsChange(widgets.filter((w) => w.i !== id));
  }

  return (
    <ReactGridLayout
      className={`layout vbx-dash-grid${editing ? " vbx-dash-grid--editing" : ""}`}
      layout={layout}
      cols={12}
      rowHeight={56}
      margin={[12, 12]}
      containerPadding={[0, 0]}
      onLayoutChange={onLayoutChange}
      onResizeStart={(_layout, item) => setResizingId(item.i)}
      onResizeStop={(next) => {
        setResizingId(null);
        if (editing) onWidgetsChange(mergeLayout(next));
      }}
      onDragStop={(next) => {
        if (editing) onWidgetsChange(mergeLayout(next));
      }}
      isDraggable={editing}
      isResizable={editing}
      resizeHandles={RESIZE_HANDLES}
      draggableHandle=".vbx-dash-drag"
      compactType="vertical"
      useCSSTransforms
    >
      {widgets.map((w) => (
        <div
          key={w.i}
          className={`relative min-h-0${editing ? " vbx-dash-item--editing" : ""}`}
        >
          {editing && (
            <div className="pointer-events-none absolute left-2 top-2 z-10 flex gap-1">
              <span className="rounded-md bg-surface2/95 px-1.5 py-0.5 font-mono text-[10px] text-muted ring-1 ring-border">
                {w.w}×{w.h}
                {resizingId === w.i ? "…" : ""}
              </span>
            </div>
          )}
          {editing && (
            <div className="absolute right-2 top-2 z-10 flex gap-1">
              <span className="vbx-dash-drag cursor-grab rounded-lg bg-surface2/90 px-2 py-1 text-[10px] text-muted ring-1 ring-border">
                ⋮⋮
              </span>
              <button
                type="button"
                className="rounded-lg bg-surface2/90 p-1 text-muted ring-1 ring-border hover:text-danger"
                onClick={() => removeWidget(w.i)}
                aria-label="Убрать виджет"
              >
                <X size={12} />
              </button>
            </div>
          )}
          <div className="h-full min-h-0">
            <DashboardWidget type={w.type} data={data} range={range} onRange={onRange} />
          </div>
        </div>
      ))}
    </ReactGridLayout>
  );
}
