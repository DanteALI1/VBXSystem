"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, LayoutTemplate, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type {
  DashboardData,
  DashboardLayoutMeta,
  LayoutWidget,
  WidgetType,
} from "@/components/dashboard/types";
import { FALLBACK_CLASSIC_WIDGETS, WIDGET_CATALOG } from "@/components/dashboard/types";
import { WidgetPicker } from "@/components/dashboard/WidgetPicker";

const DashboardCanvas = dynamic(
  () => import("@/components/dashboard/DashboardCanvas").then((m) => m.DashboardCanvas),
  { ssr: false, loading: () => <div className="text-sm text-muted">Загрузка сетки…</div> },
);

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [range, setRange] = useState("1M");
  const [err, setErr] = useState<string | null>(null);
  const [layoutErr, setLayoutErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [layouts, setLayouts] = useState<DashboardLayoutMeta[]>([]);
  const [active, setActive] = useState<DashboardLayoutMeta | null>(null);
  const [draft, setDraft] = useState<LayoutWidget[]>([]);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const viewsRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async (r: string) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api<DashboardData>(`/dashboard?chart_range=${encodeURIComponent(r)}`);
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLayouts = useCallback(async () => {
    setLayoutErr(null);
    try {
      const [list, act] = await Promise.all([
        api<DashboardLayoutMeta[]>("/dashboard/layouts"),
        api<DashboardLayoutMeta>("/dashboard/layouts/active"),
      ]);
      setLayouts(list);
      setActive(act);
      setDraft(act.layout.widgets || []);
      setDirty(false);
      setEditing(false);
    } catch (e) {
      setLayoutErr(e instanceof Error ? e.message : "Ошибка шаблонов");
      setDraft((prev) => (prev.length ? prev : FALLBACK_CLASSIC_WIDGETS));
    }
  }, []);

  useEffect(() => {
    loadData(range);
  }, [loadData, range]);

  useEffect(() => {
    loadLayouts();
  }, [loadLayouts]);

  useEffect(() => {
    if (!viewsOpen) return;
    function onDoc(e: MouseEvent) {
      if (viewsRef.current && !viewsRef.current.contains(e.target as Node)) {
        setViewsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [viewsOpen]);

  const usedTypes = useMemo(() => new Set(draft.map((w) => w.type)), [draft]);

  async function selectLayout(id: number) {
    if (dirty && !confirm("Есть несохранённые изменения. Загрузить другой шаблон?")) return;
    setBusy(true);
    setErr(null);
    try {
      const act = await api<DashboardLayoutMeta>("/dashboard/layouts/active", {
        method: "PUT",
        body: JSON.stringify({ layout_id: id }),
      });
      setActive(act);
      setDraft(act.layout.widgets || []);
      setLayouts(await api<DashboardLayoutMeta[]>("/dashboard/layouts"));
      setDirty(false);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  function onWidgetsChange(next: LayoutWidget[]) {
    setDraft(next);
    setDirty(true);
  }

  function addWidget(type: WidgetType) {
    if (usedTypes.has(type)) return;
    const meta = WIDGET_CATALOG.find((c) => c.type === type)!;
    const maxY = draft.reduce((m, w) => Math.max(m, w.y + w.h), 0);
    setDraft([
      ...draft,
      {
        i: type,
        type,
        x: 0,
        y: maxY,
        w: meta.w,
        h: meta.h,
        minW: 2,
        minH: 2,
      },
    ]);
    setDirty(true);
    setPickerOpen(false);
  }

  async function saveOverwrite() {
    if (!active || active.is_system) {
      setSaveAsOpen(true);
      setSaveAsName(`${active?.name || "Шаблон"} (мой)`);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const updated = await api<DashboardLayoutMeta>(`/dashboard/layouts/${active.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: active.name,
          layout: { version: 1, cols: 12, widgets: draft },
        }),
      });
      setActive(updated);
      setDraft(updated.layout.widgets || []);
      setLayouts(await api<DashboardLayoutMeta[]>("/dashboard/layouts"));
      setDirty(false);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function saveAs() {
    const name = saveAsName.trim();
    if (!name) return;
    setBusy(true);
    setErr(null);
    try {
      const created = await api<DashboardLayoutMeta>("/dashboard/layouts", {
        method: "POST",
        body: JSON.stringify({
          name,
          source_id: active?.id,
          layout: { version: 1, cols: 12, widgets: draft },
        }),
      });
      setActive(created);
      setDraft(created.layout.widgets || []);
      setLayouts(await api<DashboardLayoutMeta[]>("/dashboard/layouts"));
      setDirty(false);
      setEditing(false);
      setSaveAsOpen(false);
      setSaveAsName("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function duplicateActive() {
    if (!active) return;
    setBusy(true);
    try {
      const created = await api<DashboardLayoutMeta>(`/dashboard/layouts/${active.id}/duplicate`, {
        method: "POST",
      });
      setActive(created);
      setDraft(created.layout.widgets || []);
      setLayouts(await api<DashboardLayoutMeta[]>("/dashboard/layouts"));
      setDirty(false);
      setEditing(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function deleteActive() {
    if (!active || active.is_system) return;
    if (!confirm(`Удалить шаблон «${active.name}»?`)) return;
    setBusy(true);
    try {
      await api(`/dashboard/layouts/${active.id}`, { method: "DELETE" });
      await loadLayouts();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  function discardEdits() {
    if (!active) return;
    setDraft(active.layout.widgets || []);
    setDirty(false);
    setEditing(false);
  }

  return (
    <div className="space-y-4" data-testid="dashboard-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="vbx-page-title">Dashboard</h1>
          <p className="vbx-page-sub">
            {active ? active.name : "—"}
            {active?.is_system ? " · системный" : ""}
            {dirty ? " · не сохранено" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={viewsRef}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setViewsOpen((v) => !v)}
              aria-expanded={viewsOpen}
              aria-haspopup="dialog"
              title="Представления"
            >
              <LayoutTemplate size={14} />
              Представления
            </Button>
            {viewsOpen && (
              <div className="absolute right-0 z-40 mt-2 w-[min(100vw-2rem,22rem)] rounded-2xl border border-border bg-surface p-3 shadow-soft">
                <div className="mb-3">
                  <label className="mb-1 block text-xs text-muted">Шаблон</label>
                  <select
                    className="vbx-field"
                    value={active?.id ?? ""}
                    disabled={busy || editing}
                    onChange={(e) => {
                      selectLayout(Number(e.target.value));
                    }}
                  >
                    {layouts.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.is_system ? "★ " : ""}
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {active?.is_system && <Badge tone="accent">системный</Badge>}
                    {dirty && <Badge tone="warn">не сохранено</Badge>}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {!editing ? (
                    <Button
                      type="button"
                      className="w-full justify-start"
                      onClick={() => {
                        setEditing(true);
                        setViewsOpen(false);
                      }}
                      disabled={!active}
                    >
                      <Pencil size={14} />
                      Редактировать
                    </Button>
                  ) : (
                    <p className="px-1 text-xs text-muted">Режим правки активен — панель ниже.</p>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full justify-start"
                    onClick={() => {
                      duplicateActive();
                      setViewsOpen(false);
                    }}
                    disabled={!active || busy}
                  >
                    <Copy size={14} />
                    Дублировать
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => {
                      deleteActive();
                      setViewsOpen(false);
                    }}
                    disabled={!active || active.is_system || busy}
                  >
                    <Trash2 size={14} />
                    Удалить
                  </Button>
                </div>
              </div>
            )}
          </div>
          <Button type="button" variant="secondary" onClick={() => loadData(range)} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Обновить данные
          </Button>
        </div>
      </div>

      {editing && (
        <Card className="flex flex-wrap items-center gap-2 py-3">
          <Button type="button" onClick={saveOverwrite} disabled={busy}>
            <Save size={14} />
            {active?.is_system ? "Сохранить как…" : "Сохранить"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setSaveAsName(
                active?.is_system ? `${active.name} (мой)` : `${active?.name || "Шаблон"} копия`,
              );
              setSaveAsOpen(true);
            }}
            disabled={busy}
          >
            <Copy size={14} />
            Сохранить как…
          </Button>
          <Button type="button" onClick={() => setPickerOpen(true)}>
            <Plus size={14} />
            Добавить…
          </Button>
          <Button type="button" variant="ghost" onClick={discardEdits}>
            <X size={14} />
            Отменить
          </Button>
          <span className="ml-auto text-xs text-muted">
            Тяните края блоков · {draft.length} виджетов
          </span>
        </Card>
      )}

      {saveAsOpen && (
        <Card className="flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1 text-sm">
            <span className="mb-1 block text-muted">Название нового шаблона</span>
            <Input
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              placeholder="Мой дашборд"
            />
          </label>
          <Button type="button" onClick={saveAs} disabled={busy || !saveAsName.trim()}>
            Сохранить
          </Button>
          <Button type="button" variant="ghost" onClick={() => setSaveAsOpen(false)}>
            Закрыть
          </Button>
        </Card>
      )}

      {err && (
        <Card className="border-danger/40 text-sm text-danger" role="alert">
          {err}
        </Card>
      )}
      {layoutErr && (
        <Card className="border-warn/40 text-sm text-warn" role="alert">
          Шаблоны недоступны ({layoutErr}). Показан запасной Classic.
        </Card>
      )}

      <DashboardCanvas
        widgets={draft.length ? draft : FALLBACK_CLASSIC_WIDGETS}
        data={data}
        range={range}
        onRange={setRange}
        editing={editing}
        onWidgetsChange={onWidgetsChange}
      />

      <WidgetPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        data={data}
        range={range}
        usedTypes={usedTypes}
        onAdd={addWidget}
      />
    </div>
  );
}
