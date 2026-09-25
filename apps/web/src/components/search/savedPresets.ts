/** Saved Search presets: filter templates + named table views (localStorage). */

import type { ActiveFilter } from "./filterTypes";
import { newFilterId } from "./filterTypes";
import type { TableViewState } from "./columnCatalog";
import { defaultViewState, loadViewState } from "./columnCatalog";

export type SavedFilterPreset = {
  id: string;
  name: string;
  filters: ActiveFilter[];
  createdAt: string;
  updatedAt: string;
};

export type SavedTableView = {
  id: string;
  name: string;
  view: TableViewState;
  createdAt: string;
  updatedAt: string;
};

const FILTERS_KEY = "vbx.search.filterPresets.v1";
const VIEWS_KEY = "vbx.search.tableViews.v1";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Fresh ids so loaded chips don't collide with live ones. */
export function cloneFilters(filters: ActiveFilter[]): ActiveFilter[] {
  return filters.map((f) => ({
    ...f,
    id: newFilterId(),
    join: f.join === "or" ? "or" : f.join === "and" ? "and" : undefined,
  }));
}

export function listFilterPresets(): SavedFilterPreset[] {
  const list = readJson<SavedFilterPreset[]>(FILTERS_KEY, []);
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function saveFilterPreset(name: string, filters: ActiveFilter[]): SavedFilterPreset {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) throw new Error("Введите название");
  if (!filters.length) throw new Error("Нет фильтров для сохранения");

  const now = new Date().toISOString();
  const list = listFilterPresets();
  const existing = list.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  let next: SavedFilterPreset;
  if (existing) {
    next = {
      ...existing,
      filters: cloneFilters(filters),
      updatedAt: now,
    };
    writeJson(
      FILTERS_KEY,
      list.map((p) => (p.id === existing.id ? next : p)),
    );
  } else {
    next = {
      id: newId("fp"),
      name: trimmed,
      filters: cloneFilters(filters),
      createdAt: now,
      updatedAt: now,
    };
    writeJson(FILTERS_KEY, [...list, next]);
  }
  return next;
}

export function deleteFilterPreset(id: string) {
  writeJson(
    FILTERS_KEY,
    listFilterPresets().filter((p) => p.id !== id),
  );
}

export function listTableViews(): SavedTableView[] {
  const list = readJson<SavedTableView[]>(VIEWS_KEY, []);
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function saveTableView(name: string, view: TableViewState): SavedTableView {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) throw new Error("Введите название");
  const now = new Date().toISOString();
  const list = listTableViews();
  const existing = list.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const snapshot: TableViewState = JSON.parse(JSON.stringify(view));
  let next: SavedTableView;
  if (existing) {
    next = { ...existing, view: snapshot, updatedAt: now };
    writeJson(
      VIEWS_KEY,
      list.map((p) => (p.id === existing.id ? next : p)),
    );
  } else {
    next = {
      id: newId("tv"),
      name: trimmed,
      view: snapshot,
      createdAt: now,
      updatedAt: now,
    };
    writeJson(VIEWS_KEY, [...list, next]);
  }
  return next;
}

export function deleteTableView(id: string) {
  writeJson(
    VIEWS_KEY,
    listTableViews().filter((p) => p.id !== id),
  );
}

export function normalizeLoadedView(view: TableViewState): TableViewState {
  // Reuse merge logic from loadViewState by temporarily writing — or inline:
  const base = defaultViewState();
  try {
    const byId = new Map(view.columns.map((c) => [c.id, c]));
    const columns = base.columns.map((c) => {
      const prev = byId.get(c.id);
      return prev
        ? { ...c, visible: prev.visible, width: prev.width }
        : c;
    });
    const order = view.columns.map((c) => c.id);
    if (order.length) {
      columns.sort((a, b) => {
        const ia = order.indexOf(a.id);
        const ib = order.indexOf(b.id);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });
    }
    const density = view.rowDensity;
    return {
      columns,
      rowDensity:
        density === "compact" || density === "comfortable" || density === "normal"
          ? density
          : "normal",
    };
  } catch {
    return loadViewState();
  }
}
