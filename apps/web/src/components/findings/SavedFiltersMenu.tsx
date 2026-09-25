"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, ChevronDown, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import type { ChipFilter } from "@/components/filters/ChipFilterBar";

export type FindingsFilterQuery = {
  q?: string;
  filters?: ChipFilter[];
};

type SavedFilter = {
  id: number;
  name: string;
  query: FindingsFilterQuery;
};

type Props = {
  current: FindingsFilterQuery;
  onApply: (query: FindingsFilterQuery) => void;
};

export function SavedFiltersMenu({ current, onApply }: Props) {
  const [items, setItems] = useState<SavedFilter[]>([]);
  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<SavedFilter[]>("/saved-filters?scope=findings");
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
      setSaveOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function savePreset() {
    const nm = name.trim();
    if (!nm) return;
    setBusy(true);
    setErr(null);
    try {
      await api("/saved-filters", {
        method: "POST",
        body: JSON.stringify({
          scope: "findings",
          name: nm,
          query: current,
        }),
      });
      setName("");
      setSaveOpen(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    setErr(null);
    try {
      await api(`/saved-filters/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <Button
        type="button"
        variant="ghost"
        className="h-8 gap-1 px-2 text-xs"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Bookmark size={14} />
        Фильтры
        <ChevronDown size={12} className={open ? "rotate-180" : ""} />
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-64 rounded-lg border border-border bg-surface py-1 text-sm shadow-lg">
          {items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted">Нет сохранённых фильтров</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto">
              {items.map((f) => (
                <li key={f.id} className="flex items-center gap-1 px-1">
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left hover:bg-surface2"
                    onClick={() => {
                      onApply(f.query || {});
                      setOpen(false);
                    }}
                  >
                    {f.name}
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted hover:text-danger"
                    aria-label="Удалить"
                    disabled={busy}
                    onClick={() => remove(f.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border px-2 py-2">
            {saveOpen ? (
              <div className="space-y-2">
                <input
                  className="vbx-field w-full text-xs"
                  placeholder="Имя фильтра"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") savePreset();
                  }}
                />
                <div className="flex gap-1">
                  <Button type="button" className="flex-1 py-1 text-xs" disabled={busy} onClick={savePreset}>
                    Сохранить
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="py-1 text-xs"
                    onClick={() => setSaveOpen(false)}
                  >
                    Отмена
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="w-full py-1 text-xs"
                onClick={() => setSaveOpen(true)}
              >
                Сохранить текущий
              </Button>
            )}
            {err ? <p className="mt-1 text-xs text-danger">{err}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}
