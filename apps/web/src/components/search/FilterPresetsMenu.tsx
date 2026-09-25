"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkPlus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { ActiveFilter } from "./filterTypes";
import { composeCveql } from "./filterTypes";
import {
  SavedFilterPreset,
  cloneFilters,
  deleteFilterPreset,
  listFilterPresets,
  saveFilterPreset,
} from "./savedPresets";

type Props = {
  filters: ActiveFilter[];
  onLoad: (filters: ActiveFilter[]) => void;
};

type ServerView = {
  id: string;
  name: string;
  query: string;
  filters: ActiveFilter[];
};

export function FilterPresetsMenu({ filters, onLoad }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [presets, setPresets] = useState<SavedFilterPreset[]>([]);
  const [serverViews, setServerViews] = useState<ServerView[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function refreshLocal() {
    setPresets(listFilterPresets());
  }

  async function refreshServer() {
    try {
      const rows = await api<ServerView[]>("/search/views");
      setServerViews(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          query: r.query || "",
          filters: Array.isArray(r.filters) ? (r.filters as ActiveFilter[]) : [],
        })),
      );
    } catch {
      setServerViews([]);
    }
  }

  useEffect(() => {
    if (!open) return;
    refreshLocal();
    void refreshServer();
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSaving(false);
        setErr(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      saveFilterPreset(name, filters);
      const q = composeCveql(filters);
      await api("/search/views", {
        method: "POST",
        body: JSON.stringify({ name, query: q, filters, columns: {} }),
      }).catch(() => null);
      setName("");
      setSaving(false);
      refreshLocal();
      void refreshServer();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-xs text-muted hover:bg-surface hover:text-accent2"
        onClick={() => {
          setOpen((v) => !v);
          setSaving(false);
          setErr(null);
        }}
        title="Шаблоны фильтров"
        aria-expanded={open}
        data-testid="filter-presets"
      >
        <Bookmark size={13} />
      </button>

      {open && (
        <div className="absolute right-0 z-[80] mt-1.5 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-soft">
          <div className="flex items-center justify-between border-b border-border px-2.5 py-2">
            <span className="text-xs font-medium">Шаблоны фильтров</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-accent2 hover:bg-surface2 disabled:opacity-40"
              disabled={!filters.length}
              onClick={() => {
                setSaving(true);
                setName("");
                setErr(null);
              }}
              title="Сохранить текущие фильтры"
            >
              <BookmarkPlus size={12} />
              Сохранить
            </button>
          </div>

          {saving && (
            <form
              onSubmit={(e) => void onSave(e)}
              className="space-y-1.5 border-b border-border bg-surface2/40 p-2.5"
            >
              <label className="block text-[11px] text-muted">
                Название шаблона
                <input
                  autoFocus
                  className="vbx-field-sm mt-1 w-full"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="напр. Critical + BDU"
                  maxLength={80}
                />
              </label>
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
                  className="rounded-md px-2 py-1 text-[11px] text-muted hover:text-text"
                  onClick={() => {
                    setSaving(false);
                    setErr(null);
                  }}
                >
                  Отмена
                </button>
              </div>
            </form>
          )}

          <div className="max-h-56 overflow-auto p-1">
            {presets.length === 0 && serverViews.length === 0 && (
              <p className="px-2 py-4 text-center text-[11px] text-muted">
                Нет сохранённых шаблонов. Настройте фильтры и нажмите «Сохранить».
              </p>
            )}
            {serverViews.map((p) => (
              <div
                key={`srv-${p.id}`}
                className="group flex items-start gap-1 rounded-md px-2 py-1.5 hover:bg-surface2"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    if (p.filters?.length) onLoad(cloneFilters(p.filters));
                    setOpen(false);
                  }}
                  title={p.query || composeCveql(p.filters || [])}
                >
                  <div className="truncate text-xs font-medium">
                    {p.name}{" "}
                    <span className="text-[10px] font-normal text-muted">server</span>
                  </div>
                  <div className="truncate font-mono text-[10px] text-muted">
                    {p.query || composeCveql(p.filters || [])}
                  </div>
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded p-1 text-muted opacity-60 hover:text-danger group-hover:opacity-100"
                  onClick={() => {
                    void api(`/search/views/${encodeURIComponent(p.id)}`, {
                      method: "DELETE",
                    })
                      .then(() => refreshServer())
                      .catch(() => null);
                  }}
                  aria-label={`Удалить «${p.name}»`}
                  title="Удалить (сервер)"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {presets.map((p) => (
              <div
                key={p.id}
                className="group flex items-start gap-1 rounded-md px-2 py-1.5 hover:bg-surface2"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    onLoad(cloneFilters(p.filters));
                    setOpen(false);
                  }}
                  title={composeCveql(p.filters)}
                >
                  <div className="truncate text-xs font-medium">{p.name}</div>
                  <div className="truncate font-mono text-[10px] text-muted">
                    {composeCveql(p.filters)}
                  </div>
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded p-1 text-muted opacity-60 hover:text-danger group-hover:opacity-100"
                  onClick={() => {
                    deleteFilterPreset(p.id);
                    refreshLocal();
                  }}
                  aria-label={`Удалить «${p.name}»`}
                  title="Удалить"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
