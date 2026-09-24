"use client";

import { useMemo } from "react";
import GridLayout, { Layout, WidthProvider } from "react-grid-layout";
import { X } from "lucide-react";
import { DashboardWidget } from "./widgets";
import type { DashboardData, LayoutWidget, WidgetType } from "./types";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ReactGridLayout = WidthProvider(GridLayout);

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
        static: !editing,
      })),
    [widgets, editing],
  );

  function onLayoutChange(next: Layout[]) {
    if (!editing) return;
    const byId = new Map(widgets.map((w) => [w.i, w]));
    const merged: LayoutWidget[] = next.map((n) => {
      const prev = byId.get(n.i);
      return {
        i: n.i,
        type: (prev?.type || n.i) as WidgetType,
        x: n.x,
        y: n.y,
        w: n.w,
        h: n.h,
        minW: n.minW,
        minH: n.minH,
      };
    });
    onWidgetsChange(merged);
  }

  function removeWidget(id: string) {
    onWidgetsChange(widgets.filter((w) => w.i !== id));
  }

  return (
    <ReactGridLayout
      className="layout"
      layout={layout}
      cols={12}
      rowHeight={56}
      margin={[12, 12]}
      containerPadding={[0, 0]}
      onLayoutChange={onLayoutChange}
      isDraggable={editing}
      isResizable={editing}
      draggableHandle=".vbx-dash-drag"
      compactType="vertical"
      useCSSTransforms
    >
      {widgets.map((w) => (
        <div key={w.i} className="relative min-h-0">
          {editing && (
            <div className="absolute right-2 top-2 z-10 flex gap-1">
              <span className="vbx-dash-drag cursor-grab rounded-lg bg-surface2/90 px-2 py-1 text-[10px] text-muted">
                ⋮⋮
              </span>
              <button
                type="button"
                className="rounded-lg bg-surface2/90 p-1 text-muted hover:text-danger"
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
