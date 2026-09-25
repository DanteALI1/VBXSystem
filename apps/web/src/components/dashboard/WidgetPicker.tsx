"use client";

import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DashboardWidget } from "./widgets";
import {
  CATEGORY_LABEL,
  WIDGET_CATALOG,
  type DashboardData,
  type WidgetCatalogItem,
  type WidgetCategory,
  type WidgetType,
} from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  data: DashboardData | null;
  range: string;
  usedTypes: Set<WidgetType>;
  onAdd: (type: WidgetType) => void;
};

const ORDER: WidgetCategory[] = ["kpi", "feeds", "ops", "charts", "sync", "nav"];

export function WidgetPicker({ open, onClose, data, range, usedTypes, onAdd }: Props) {
  const [cat, setCat] = useState<WidgetCategory | "all">("all");
  const [selected, setSelected] = useState<WidgetType>(WIDGET_CATALOG[0].type);

  const filtered = useMemo(() => {
    if (cat === "all") return WIDGET_CATALOG;
    return WIDGET_CATALOG.filter((w) => w.category === cat);
  }, [cat]);

  const current: WidgetCatalogItem =
    WIDGET_CATALOG.find((w) => w.type === selected) || WIDGET_CATALOG[0];
  const already = usedTypes.has(current.type);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog">
      <Card className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Каталог представлений</h2>
            <p className="mt-1 text-sm text-muted">
              Готовые блоки данных. Выберите из списка и добавьте на сетку — свои боксы с логикой создать нельзя.
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          <Button
            type="button"
            variant={cat === "all" ? "primary" : "ghost"}
            className="px-3 py-1.5 text-xs"
            onClick={() => setCat("all")}
          >
            Все ({WIDGET_CATALOG.length})
          </Button>
          {ORDER.map((c) => (
            <Button
              key={c}
              type="button"
              variant={cat === c ? "primary" : "ghost"}
              className="px-3 py-1.5 text-xs"
              onClick={() => setCat(c)}
            >
              {CATEGORY_LABEL[c]}
            </Button>
          ))}
        </div>

        <div className="mt-4 grid min-h-0 flex-1 gap-4 overflow-hidden md:grid-cols-[280px_1fr]">
          <ul className="max-h-[55vh] space-y-1 overflow-auto pr-1">
            {filtered.map((w) => {
              const on = usedTypes.has(w.type);
              const active = selected === w.type;
              return (
                <li key={w.type}>
                  <button
                    type="button"
                    onClick={() => setSelected(w.type)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                      active
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-accent/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{w.label}</span>
                      {on ? (
                        <Badge tone="ok">
                          <Check size={10} /> на сетке
                        </Badge>
                      ) : (
                        <Badge tone="neutral">{CATEGORY_LABEL[w.category]}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted line-clamp-2">{w.description}</p>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex min-h-0 flex-col overflow-hidden">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-display text-base font-semibold">{current.label}</div>
                <p className="text-sm text-muted">{current.description}</p>
              </div>
              <Button
                type="button"
                disabled={already}
                onClick={() => {
                  onAdd(current.type);
                }}
              >
                <Plus size={14} />
                {already ? "Уже добавлено" : "Добавить на сетку"}
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-bg/40 p-3">
              <div className="pointer-events-none origin-top-left scale-[0.92]">
                <div style={{ minHeight: current.h * 48 }}>
                  <DashboardWidget type={current.type} data={data} range={range} compact />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">
                Превью на живых данных · рекомендуемый размер {current.w}×{current.h}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
