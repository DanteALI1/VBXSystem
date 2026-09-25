"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { BookmarkPlus, Columns3, GripVertical, RotateCcw, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  COLUMN_CATALOG,
  ColumnId,
  ColumnState,
  RowDensity,
  TableViewState,
  catalogById,
  defaultViewState,
} from "@/components/search/columnCatalog";
import {
  SavedTableView,
  deleteTableView,
  listTableViews,
  normalizeLoadedView,
  saveTableView,
} from "@/components/search/savedPresets";

type Props = {
  view: TableViewState;
  onChange: (next: TableViewState) => void;
};

type ServerColView = {
  id: string;
  name: string;
  columns: TableViewState | Record<string, unknown> | unknown[];
};

export function ColumnViewEditor({ view, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<ColumnId | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedTableView[]>([]);
  const [serverViews, setServerViews] = useState<ServerColView[]>([]);

  function refreshSaved() {
    setSaved(listTableViews());
  }

  async function refreshServer() {
    try {
      const rows = await api<ServerColView[]>("/search/views");
      setServerViews(
        rows.filter((r) => r.columns && (Array.isArray(r.columns) ? false : typeof r.columns === "object")),
      );
    } catch {
      setServerViews([]);
    }
  }

  useEffect(() => {
    if (!open) return;
    refreshSaved();
    void refreshServer();
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function setColumns(columns: ColumnState[]) {
    onChange({ ...view, columns });
  }

  function toggle(id: ColumnId) {
    setColumns(
      view.columns.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)),
    );
  }

  function setWidth(id: ColumnId, width: number) {
    const min = catalogById(id).minWidth;
    setColumns(
      view.columns.map((c) =>
        c.id === id ? { ...c, width: Math.max(min, Math.min(480, width)) } : c,
      ),
    );
  }

  function setDensity(rowDensity: RowDensity) {
    onChange({ ...view, rowDensity });
  }

  function onDrop(targetId: ColumnId) {
    if (!dragId || dragId === targetId) return;
    const cols = [...view.columns];
    const from = cols.findIndex((c) => c.id === dragId);
    const to = cols.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = cols.splice(from, 1);
    cols.splice(to, 0, item);
    setColumns(cols);
    setDragId(null);
  }

  function applyServerColumns(raw: ServerColView["columns"]) {
    if (!raw || Array.isArray(raw) || typeof raw !== "object") return;
    const maybe = raw as Partial<TableViewState>;
    if (Array.isArray(maybe.columns)) {
      onChange(normalizeLoadedView(maybe as TableViewState));
    }
  }

  function onSaveView(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      saveTableView(name, view);
      void api("/search/views", {
        method: "POST",
        body: JSON.stringify({
          name,
          query: "",
          filters: [],
          columns: view,
        }),
      }).catch(() => null);
      setName("");
      setSaving(false);
      refreshSaved();
      void refreshServer();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  const hidden = COLUMN_CATALOG.filter(
    (c) => !view.columns.find((x) => x.id === c.id)?.visible,
  );

  return (
    <div className="relative" ref={ref}>
      <Button type="button" variant="secondary" onClick={() => setOpen((v) => !v)}>
        <Columns3 size={14} />
        Колонки
      </Button>
      {open && (
        <Card className="absolute right-0 z-40 mt-2 w-[min(100vw-2rem,22rem)] space-y-3 p-3 shadow-soft">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Представление таблицы</h3>
            <button
              type="button"
              className="text-muted hover:text-text"
              onClick={() => setOpen(false)}
              aria-label="Закрыть"
            >
              <X size={14} />
            </button>
          </div>

          <label className="block text-xs text-muted">
            Высота строк
            <select
              className="vbx-field mt-1"
              value={view.rowDensity}
              onChange={(e) => setDensity(e.target.value as RowDensity)}
            >
              <option value="compact">Компактная</option>
              <option value="normal">Обычная</option>
              <option value="comfortable">Просторная</option>
            </select>
          </label>

          <div>
            <div className="mb-1 text-xs text-muted">Видимые (перетащите для порядка)</div>
            <ul className="max-h-40 space-y-1 overflow-auto">
              {view.columns
                .filter((c) => c.visible)
                .map((c) => {
                  const meta = catalogById(c.id);
                  return (
                    <li
                      key={c.id}
                      draggable
                      onDragStart={() => setDragId(c.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(c.id)}
                      className="flex items-center gap-2 rounded-lg border border-border bg-surface2/60 px-2 py-1.5 text-sm"
                    >
                      <GripVertical size={12} className="shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">{meta.label}</span>
                      <input
                        type="number"
                        className="vbx-field-sm w-14"
                        value={c.width}
                        min={meta.minWidth}
                        max={480}
                        title="Ширина px"
                        onChange={(e) => setWidth(c.id, Number(e.target.value) || meta.minWidth)}
                      />
                      <button
                        type="button"
                        className="text-muted hover:text-danger"
                        onClick={() => toggle(c.id)}
                        title="Убрать"
                      >
                        <X size={12} />
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>

          {hidden.length > 0 && (
            <div>
              <div className="mb-1 text-xs text-muted">Добавить колонку</div>
              <div className="flex flex-wrap gap-1">
                {hidden.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="rounded-lg border border-border px-2 py-1 text-xs hover:border-accent/40"
                    onClick={() => toggle(c.id)}
                  >
                    + {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-border pt-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-muted">Сохранённые виды</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] text-accent2 hover:underline"
                onClick={() => {
                  setSaving(true);
                  setName("");
                  setErr(null);
                }}
              >
                <BookmarkPlus size={12} />
                Сохранить как…
              </button>
            </div>

            {saving && (
              <form onSubmit={onSaveView} className="mb-2 space-y-1.5 rounded-lg border border-border bg-surface2/40 p-2">
                <input
                  autoFocus
                  className="vbx-field-sm w-full"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Название представления"
                  maxLength={80}
                />
                {err && <p className="text-[11px] text-danger">{err}</p>}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-white hover:bg-accent2"
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    className="text-[11px] text-muted hover:text-text"
                    onClick={() => setSaving(false)}
                  >
                    Отмена
                  </button>
                </div>
              </form>
            )}

            <ul className="max-h-28 space-y-0.5 overflow-auto">
              {saved.length === 0 && serverViews.length === 0 && (
                <li className="px-1 py-2 text-center text-[11px] text-muted">Пока нет сохранённых</li>
              )}
              {saved.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-surface2"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-xs"
                    onClick={() => onChange(normalizeLoadedView(s.view))}
                  >
                    {s.name}
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted hover:text-danger"
                    onClick={() => {
                      deleteTableView(s.id);
                      refreshSaved();
                    }}
                    aria-label={`Удалить «${s.name}»`}
                  >
                    <Trash2 size={11} />
                  </button>
                </li>
              ))}
              {serverViews.map((s) => (
                <li
                  key={`srv-${s.id}`}
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-surface2"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-xs"
                    onClick={() => applyServerColumns(s.columns)}
                    title="Серверное представление"
                  >
                    {s.name} <span className="text-muted">(сервер)</span>
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted hover:text-danger"
                    onClick={() => {
                      void api(`/search/views/${encodeURIComponent(s.id)}`, { method: "DELETE" })
                        .then(() => refreshServer())
                        .catch(() => null);
                    }}
                    aria-label={`Удалить серверный «${s.name}»`}
                  >
                    <Trash2 size={11} />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start"
            onClick={() => onChange(defaultViewState())}
          >
            <RotateCcw size={14} />
            Сбросить к умолчанию
          </Button>
        </Card>
      )}
    </div>
  );
}
