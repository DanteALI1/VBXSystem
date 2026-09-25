"use client";

/**
 * Minimal chip filter bar (Search-style): quick search + "+ Фильтр" + chips.
 * Domain-agnostic — pass defs; no CVEQL coupling.
 */

import { FormEvent, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, X } from "lucide-react";

export type ChipFilterType = "enum" | "string";

export type ChipFilterDef = {
  field: string;
  label: string;
  type: ChipFilterType;
  ops?: string[];
  options?: { value: string; label: string }[];
  hint?: string;
};

export type ChipFilter = {
  id: string;
  field: string;
  op: string;
  value: string;
};

type Props = {
  defs: ChipFilterDef[];
  filters: ChipFilter[];
  onChange: (next: ChipFilter[]) => void;
  /** Debounced / on Enter — free-text search */
  search: string;
  onSearchChange: (q: string) => void;
  onSearchSubmit?: (q: string) => void;
  searchPlaceholder?: string;
  /** Extra controls on the right of the top row (e.g. overflow menu) */
  trailing?: ReactNode;
};

function newId(): string {
  return `cf_${Math.random().toString(36).slice(2, 10)}`;
}

function defFor(defs: ChipFilterDef[], field: string): ChipFilterDef | undefined {
  return defs.find((d) => d.field === field);
}

function makeFilter(defs: ChipFilterDef[], field: string): ChipFilter | null {
  const def = defFor(defs, field);
  if (!def) return null;
  const ops = def.ops || ["="];
  return {
    id: newId(),
    field,
    op: ops[0],
    value: def.type === "enum" ? def.options?.[0]?.value || "" : "",
  };
}

function matchesPicker(q: string, d: ChipFilterDef): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return (
    d.field.toLowerCase().includes(n) ||
    d.label.toLowerCase().includes(n) ||
    (d.hint || "").toLowerCase().includes(n)
  );
}

export function ChipFilterBar({
  defs,
  filters,
  onChange,
  search,
  onSearchChange,
  onSearchSubmit,
  searchPlaceholder = "Поиск…",
  trailing,
}: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [pickerQ, setPickerQ] = useState("");
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const pickerItems = useMemo(
    () => defs.filter((d) => matchesPicker(pickerQ, d)),
    [defs, pickerQ],
  );

  useLayoutEffect(() => {
    if (!showAdd || !addBtnRef.current) {
      setMenuPos(null);
      return;
    }
    const r = addBtnRef.current.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 4, left: r.left });
  }, [showAdd]);

  useEffect(() => {
    if (!showAdd) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || addBtnRef.current?.contains(t)) return;
      setShowAdd(false);
      setPickerQ("");
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowAdd(false);
        setPickerQ("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [showAdd]);

  function addField(field: string) {
    const made = makeFilter(defs, field);
    if (!made) return;
    // one chip per field — replace existing
    const rest = filters.filter((f) => f.field !== field);
    onChange([...rest, made]);
    setShowAdd(false);
    setPickerQ("");
  }

  function updateFilter(id: string, patch: Partial<ChipFilter>) {
    onChange(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function removeFilter(id: string) {
    onChange(filters.filter((f) => f.id !== id));
  }

  function onSubmitSearch(e: FormEvent) {
    e.preventDefault();
    onSearchSubmit?.(search);
  }

  const pickerMenu =
    showAdd && menuPos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[80] w-56 overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
            style={{ top: menuPos.top, left: menuPos.left }}
            role="listbox"
            data-testid="chip-filter-picker"
          >
            <div className="border-b border-border p-1.5">
              <input
                autoFocus
                className="vbx-field-sm h-7 w-full"
                placeholder="Поле…"
                value={pickerQ}
                onChange={(e) => setPickerQ(e.target.value)}
              />
            </div>
            <ul className="max-h-56 overflow-y-auto py-1 text-sm">
              {pickerItems.map((d) => (
                <li key={d.field}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-surface2"
                    onClick={() => addField(d.field)}
                  >
                    <span className="text-text">{d.label}</span>
                    {d.hint ? (
                      <span className="text-[10px] text-muted">{d.hint}</span>
                    ) : null}
                  </button>
                </li>
              ))}
              {!pickerItems.length && (
                <li className="px-3 py-2 text-xs text-muted">Ничего не найдено</li>
              )}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="space-y-1.5" data-testid="chip-filter-bar">
      <div className="flex flex-wrap items-center gap-1">
        <form onSubmit={onSubmitSearch} className="relative min-w-[10rem] max-w-md flex-1">
          <Search
            size={12}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            className="vbx-field-sm h-7 w-full py-0 pl-7 pr-2"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Поиск"
            data-testid="chip-filter-search"
          />
        </form>

        <button
          ref={addBtnRef}
          type="button"
          className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-xs font-medium text-accent2 hover:bg-surface"
          onClick={() => setShowAdd((v) => !v)}
          data-testid="chip-filter-add"
          aria-expanded={showAdd}
        >
          <Plus size={12} />
          Фильтр
        </button>
        {pickerMenu}

        {trailing ? <div className="ml-auto flex items-center gap-1">{trailing}</div> : null}
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {filters.map((f) => {
            const def = defFor(defs, f.field);
            const ops = def?.ops || ["="];
            return (
              <div
                key={f.id}
                className="flex flex-wrap items-center gap-0.5 rounded-md border border-border/80 bg-surface2/40 px-1.5 py-0.5 text-[11px]"
                data-testid="chip-filter-chip"
              >
                <span className="text-muted">{def?.label || f.field}</span>
                <select
                  className="rounded border-0 bg-transparent py-0 pl-0.5 pr-0 text-[11px] outline-none"
                  value={f.op}
                  onChange={(e) => updateFilter(f.id, { op: e.target.value })}
                  aria-label="Оператор"
                >
                  {ops.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
                {def?.type === "enum" && def.options?.length ? (
                  <select
                    className="max-w-[7rem] rounded border-0 bg-transparent py-0 text-[11px] text-text outline-none"
                    value={f.value}
                    onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                    aria-label="Значение"
                  >
                    {def.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="w-24 max-w-[8rem] rounded border-0 bg-transparent px-0.5 py-0 text-[11px] text-text outline-none"
                    value={f.value}
                    onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                    placeholder="…"
                  />
                )}
                <button
                  type="button"
                  className="rounded p-0.5 text-muted hover:text-danger"
                  onClick={() => removeFilter(f.id)}
                  aria-label="Убрать фильтр"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="text-[11px] text-muted hover:text-danger"
            onClick={() => onChange([])}
          >
            Сбросить
          </button>
        </div>
      )}
    </div>
  );
}

/** Map chips → flat query params (one value per field; last wins). */
export function chipsToParams(
  filters: ChipFilter[],
  allowed: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of filters) {
    if (!allowed.includes(f.field)) continue;
    const v = f.value.trim();
    if (!v) continue;
    out[f.field] = v;
  }
  return out;
}
