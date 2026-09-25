"use client";

import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, RotateCcw, Search, X } from "lucide-react";
import {
  ActiveFilter,
  FILTER_DEFS,
  FilterJoin,
  composeCveql,
  defFor,
  isFilterComplete,
  labelForField,
  makeFilter,
} from "./filterTypes";
import { FilterPresetsMenu } from "./FilterPresetsMenu";

type Props = {
  filters: ActiveFilter[];
  onChange: (next: ActiveFilter[]) => void;
  onApply: (next: ActiveFilter[]) => void;
  showPreview?: boolean;
  /** bar = chips сверху; panel = вертикальный Kibana Filters Builder */
  layout?: "bar" | "panel";
};

function matchesPicker(q: string, field: string, label: string, hint?: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return (
    field.toLowerCase().includes(n) ||
    label.toLowerCase().includes(n) ||
    (hint || "").toLowerCase().includes(n)
  );
}

function JoinToggle({
  value,
  onChange,
  compact,
}: {
  value: FilterJoin;
  onChange: (j: FilterJoin) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "inline-flex overflow-hidden rounded-md border border-accent/50 text-[10px] font-bold uppercase tracking-wide"
          : "inline-flex shrink-0 items-stretch overflow-hidden rounded-lg border-2 border-accent/60 text-xs font-bold uppercase tracking-wide shadow-sm"
      }
      role="group"
      aria-label="Связь фильтров: AND или OR"
      data-testid="filter-join"
    >
      <button
        type="button"
        className={
          value === "and"
            ? compact
              ? "bg-accent px-2 py-0.5 text-white"
              : "bg-accent px-2.5 py-1.5 text-white"
            : compact
              ? "bg-surface2 px-2 py-0.5 text-muted hover:bg-surface hover:text-text"
              : "bg-surface2 px-2.5 py-1.5 text-muted hover:bg-surface hover:text-text"
        }
        onClick={() => onChange("and")}
        title="И (оба условия)"
      >
        AND
      </button>
      <button
        type="button"
        className={
          value === "or"
            ? compact
              ? "bg-accent px-2 py-0.5 text-white"
              : "bg-accent px-2.5 py-1.5 text-white"
            : compact
              ? "bg-surface2 px-2 py-0.5 text-muted hover:bg-surface hover:text-text"
              : "bg-surface2 px-2.5 py-1.5 text-muted hover:bg-surface hover:text-text"
        }
        onClick={() => onChange("or")}
        title="ИЛИ (хотя бы одно)"
      >
        OR
      </button>
    </div>
  );
}

function ValueEditor({
  filter: f,
  onUpdate,
  onFlush,
  wide,
}: {
  filter: ActiveFilter;
  onUpdate: (patch: Partial<ActiveFilter>, immediate: boolean) => void;
  onFlush: () => void;
  wide?: boolean;
}) {
  const def = defFor(f.field);
  const inputClass = wide
    ? "vbx-field-sm w-full min-w-0"
    : "w-20 max-w-[7rem] rounded border-0 bg-transparent px-0.5 py-0 text-[11px] text-text outline-none";
  const selectClass = wide
    ? "vbx-field-sm w-full min-w-0"
    : "max-w-[6rem] rounded border-0 bg-transparent py-0 text-[11px] text-text outline-none";

  if (def?.type === "enum") {
    if (def.ops.includes("in") && f.op === "in") {
      return (
        <input
          className={wide ? inputClass : "vbx-field-sm w-36"}
          value={f.value}
          placeholder="CRITICAL, HIGH"
          onChange={(e) => onUpdate({ value: e.target.value }, false)}
          onBlur={onFlush}
          onKeyDown={(e) => {
            if (e.key === "Enter") onFlush();
          }}
        />
      );
    }
    return (
      <select
        className={selectClass}
        value={f.value}
        onChange={(e) => onUpdate({ value: e.target.value }, true)}
      >
        {(def.options || []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (def?.type === "bool") {
    return (
      <select
        className={selectClass}
        value={f.value}
        onChange={(e) => onUpdate({ value: e.target.value }, true)}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      <input
        className={inputClass}
        value={f.value}
        type={def?.type === "date" ? "date" : def?.type === "number" ? "number" : "text"}
        step={f.field === "epss_scores.score" ? "0.1" : def?.type === "number" ? "any" : undefined}
        min={f.field === "epss_scores.score" ? 0 : undefined}
        max={f.field === "epss_scores.score" ? 100 : undefined}
        placeholder={def?.hint || "значение"}
        onChange={(e) => onUpdate({ value: e.target.value }, false)}
        onBlur={onFlush}
        onKeyDown={(e) => {
          if (e.key === "Enter") onFlush();
        }}
      />
      {f.field === "epss_scores.score" && <span className="text-[10px] text-muted">%</span>}
    </span>
  );
}

export function FilterBar({
  filters,
  onChange,
  onApply,
  showPreview = true,
  layout = "bar",
}: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [pickerQ, setPickerQ] = useState("");
  const [textQ, setTextQ] = useState("");
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const addRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef(filters);
  latestRef.current = filters;

  function closePicker() {
    setShowAdd(false);
    setPickerQ("");
    setPickerPos(null);
  }

  function updatePickerPos() {
    const el = addRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(Math.max(layout === "panel" ? r.width : 260, 220), window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setPickerPos({
      top: r.bottom + 6,
      left,
      width,
    });
  }

  useLayoutEffect(() => {
    if (!showAdd) return;
    updatePickerPos();
    function onScrollOrResize() {
      updatePickerPos();
    }
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdd, layout]);

  useEffect(() => {
    if (!showAdd) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (addRef.current?.contains(t)) return;
      if (pickerRef.current?.contains(t)) return;
      closePicker();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePicker();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [showAdd]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const preview = useMemo(() => composeCveql(filters), [filters]);
  const completeCount = filters.filter(isFilterComplete).length;

  const pickerItems = useMemo(
    () => FILTER_DEFS.filter((d) => matchesPicker(pickerQ, d.field, d.label, d.hint)),
    [pickerQ],
  );

  function scheduleApply(next: ActiveFilter[]) {
    latestRef.current = next;
    onChange(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onApply(latestRef.current), 450);
  }

  function applyNow(next: ActiveFilter[]) {
    latestRef.current = next;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onChange(next);
    onApply(next);
  }

  function flushApply() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onApply(latestRef.current);
  }

  function updateFilter(id: string, patch: Partial<ActiveFilter>, immediate: boolean) {
    const next = latestRef.current.map((f) => (f.id === id ? { ...f, ...patch } : f));
    if (immediate) applyNow(next);
    else scheduleApply(next);
  }

  function setJoin(id: string, join: FilterJoin) {
    applyNow(latestRef.current.map((f) => (f.id === id ? { ...f, join } : f)));
  }

  function removeFilter(id: string) {
    applyNow(latestRef.current.filter((f) => f.id !== id));
  }

  function clearAll() {
    applyNow([]);
  }

  function addFilter(field: string) {
    const cur = latestRef.current;
    const made = makeFilter(field, { join: cur.length ? "and" : undefined });
    if (!made) return;
    const next = [...cur, made];
    const def = defFor(field);
    if (def?.type === "enum" || def?.type === "bool") applyNow(next);
    else {
      latestRef.current = next;
      onChange(next);
    }
    setShowAdd(false);
    setPickerQ("");
    setPickerPos(null);
  }

  function addTextSearch(e: FormEvent) {
    e.preventDefault();
    const v = textQ.trim();
    if (!v) return;
    const cur = latestRef.current;
    const isCve = /^CVE-\d{4}-\d+/i.test(v);
    const made = isCve
      ? makeFilter("id", { op: "~", value: v.toUpperCase(), join: cur.length ? "and" : undefined })
      : makeFilter("description", {
          op: "~",
          value: v,
          join: cur.length ? "and" : undefined,
        });
    if (!made) return;
    applyNow([...cur, made]);
    setTextQ("");
  }

  function setAllJoins(join: FilterJoin) {
    const cur = latestRef.current;
    if (cur.length < 2) return;
    applyNow(cur.map((f, i) => (i === 0 ? f : { ...f, join })));
  }

  const pickerMenu =
    showAdd &&
    pickerPos &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={pickerRef}
        role="listbox"
        data-testid="filter-field-picker"
        className="fixed z-[200] overflow-hidden rounded-lg border border-border bg-surface shadow-soft"
        style={{
          top: pickerPos.top,
          left: pickerPos.left,
          width: pickerPos.width,
          maxHeight: Math.min(280, window.innerHeight - pickerPos.top - 12),
        }}
      >
        <div className="border-b border-border p-1.5">
          <input
            autoFocus
            className="vbx-field-sm w-full"
            placeholder="Найти поле…"
            value={pickerQ}
            onChange={(e) => setPickerQ(e.target.value)}
            aria-label="Поиск поля фильтра"
            data-testid="filter-field-search"
          />
        </div>
        <div className="max-h-56 overflow-auto p-0.5">
          {pickerItems.length === 0 && (
            <div className="px-2 py-3 text-center text-[11px] text-muted">Ничего не найдено</div>
          )}
          {pickerItems.map((d) => (
            <button
              key={d.field}
              type="button"
              className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-surface2"
              onClick={() => addFilter(d.field)}
            >
              <span className="flex w-full items-center justify-between gap-2 text-xs">
                <span>{d.label}</span>
                <span className="font-mono text-[9px] text-muted">{d.field}</span>
              </span>
            </button>
          ))}
        </div>
      </div>,
      document.body,
    );

  const addPicker = (
    <div className="relative shrink-0" ref={addRef}>
      <button
        type="button"
        className={
          layout === "panel"
            ? "inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-accent2 hover:border-accent hover:bg-surface2"
            : "inline-flex h-7 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-xs font-medium text-accent2 hover:bg-surface"
        }
        onClick={() => {
          if (showAdd) closePicker();
          else {
            setShowAdd(true);
            // position set in useLayoutEffect
          }
        }}
        data-testid="add-filter"
        aria-expanded={showAdd}
        aria-haspopup="listbox"
      >
        <Plus size={12} />
        Фильтр
      </button>
      {pickerMenu}
    </div>
  );

  if (layout === "panel") {
    return (
      <div className="space-y-2" data-testid="filter-bar" data-layout="panel">
        <form onSubmit={addTextSearch} className="relative">
          <Search
            size={12}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            className="vbx-field-sm h-7 w-full py-0 pl-7 pr-2"
            placeholder="CVE или текст…"
            value={textQ}
            onChange={(e) => setTextQ(e.target.value)}
            aria-label="Быстрый поиск"
            data-testid="filter-quick-search"
          />
        </form>

        {filters.length >= 2 && (
          <div className="flex h-6 overflow-hidden rounded-md border border-border/70 text-[10px]">
            <button
              type="button"
              className="flex-1 text-muted hover:bg-surface hover:text-text"
              onClick={() => setAllJoins("and")}
            >
              ∧ AND
            </button>
            <button
              type="button"
              className="flex-1 text-muted hover:bg-surface hover:text-text"
              onClick={() => setAllJoins("or")}
            >
              ∨ OR
            </button>
          </div>
        )}

        <div className="space-y-1.5">
          {filters.map((f, index) => {
            const def = defFor(f.field);
            return (
              <div key={f.id} className="space-y-1" data-testid="filter-chip">
                {index > 0 && (
                  <div className="flex justify-center">
                    <JoinToggle
                      value={f.join === "or" ? "or" : "and"}
                      onChange={(j) => setJoin(f.id, j)}
                      compact
                    />
                  </div>
                )}
                <div className="rounded-md border border-border/80 bg-surface2/30 p-1.5">
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <span className="text-[11px] text-muted">{labelForField(f.field)}</span>
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted hover:text-danger"
                      onClick={() => removeFilter(f.id)}
                      aria-label="Убрать фильтр"
                    >
                      <X size={11} />
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    <select
                      className="vbx-field-sm w-full"
                      value={f.op}
                      onChange={(e) => updateFilter(f.id, { op: e.target.value }, true)}
                      aria-label="Оператор"
                    >
                      {(def?.ops || ["="]).map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                    <ValueEditor
                      filter={f}
                      wide
                      onUpdate={(patch, immediate) => updateFilter(f.id, patch, immediate)}
                      onFlush={flushApply}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {addPicker}

        {filters.length > 0 && (
          <button
            type="button"
            className="w-full text-center text-[11px] text-muted hover:text-danger"
            onClick={clearAll}
          >
            Сбросить все
          </button>
        )}

        {showPreview && completeCount > 0 && (
          <p className="break-all font-mono text-[10px] text-muted" data-testid="filter-preview">
            → {preview}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="filter-bar" data-layout="bar">
      <div className="flex flex-wrap items-center gap-1">
        <form onSubmit={addTextSearch} className="relative min-w-[8rem] max-w-xs flex-1">
          <Search
            size={12}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            className="vbx-field-sm h-7 w-full py-0 pl-7 pr-2"
            placeholder="CVE, текст…"
            value={textQ}
            onChange={(e) => setTextQ(e.target.value)}
            aria-label="Быстрый поиск"
            data-testid="filter-quick-search"
          />
        </form>

        {addPicker}

        <FilterPresetsMenu
          filters={filters}
          onLoad={(next) => applyNow(next)}
        />

        {filters.length >= 2 && (
          <div className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border/70 text-[10px]">
            <button
              type="button"
              className="px-1.5 py-1 text-muted hover:bg-surface hover:text-text"
              onClick={() => setAllJoins("and")}
              title="Все через AND"
            >
              ∧
            </button>
            <button
              type="button"
              className="px-1.5 py-1 text-muted hover:bg-surface hover:text-text"
              onClick={() => setAllJoins("or")}
              title="Все через OR"
            >
              ∨
            </button>
          </div>
        )}

        <button
          type="button"
          className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted hover:bg-surface hover:text-danger disabled:opacity-30"
          onClick={clearAll}
          disabled={!filters.length}
          title="Сбросить все фильтры"
          data-testid="filter-reset-all"
        >
          <RotateCcw size={12} />
          Сбросить
        </button>
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {filters.map((f, index) => {
            const def = defFor(f.field);
            return (
              <div key={f.id} className="flex flex-wrap items-center gap-1">
                {index > 0 && (
                  <JoinToggle
                    compact
                    value={f.join === "or" ? "or" : "and"}
                    onChange={(j) => setJoin(f.id, j)}
                  />
                )}
                <div
                  className="flex flex-wrap items-center gap-0.5 rounded-md border border-border/80 bg-surface2/40 px-1.5 py-0.5 text-[11px]"
                  data-testid="filter-chip"
                >
                  <span className="text-muted">{labelForField(f.field)}</span>
                  <select
                    className="rounded border-0 bg-transparent py-0 pl-0.5 pr-0 text-[11px] outline-none"
                    value={f.op}
                    onChange={(e) => updateFilter(f.id, { op: e.target.value }, true)}
                    aria-label="Оператор"
                  >
                    {(def?.ops || ["="]).map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                  <ValueEditor
                    filter={f}
                    onUpdate={(patch, immediate) => updateFilter(f.id, patch, immediate)}
                    onFlush={flushApply}
                  />
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted hover:text-danger"
                    onClick={() => removeFilter(f.id)}
                    aria-label="Убрать фильтр"
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
