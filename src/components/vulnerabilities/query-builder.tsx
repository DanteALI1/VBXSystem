"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SearchField } from "@/lib/search/advanced-query";
import {
  buildQueryFromForm,
  emptyQueryFormRow,
  QUERY_BUILDER_FIELDS,
  type QueryFormRow,
} from "@/lib/search/query-form";

const OPS = [":", "=", ">", ">=", "<", "<="] as const;

export function QueryBuilder({
  onApply,
  onClose,
}: {
  onApply: (query: string) => void;
  onClose?: () => void;
}) {
  const [rows, setRows] = useState<QueryFormRow[]>([emptyQueryFormRow("1")]);

  function updateRow(id: string, patch: Partial<QueryFormRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div
      className="space-y-3 rounded-md border bg-background p-3"
      data-testid="query-builder"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Query Builder (AND)</p>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() =>
            setRows((prev) => [...prev, emptyQueryFormRow(String(Date.now()))])
          }
        >
          Add field
        </Button>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr_auto]"
          >
            <div>
              <Label className="sr-only">Field</Label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                value={row.field}
                onChange={(e) =>
                  updateRow(row.id, { field: e.target.value as SearchField })
                }
              >
                {QUERY_BUILDER_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <select
              className="h-8 rounded-lg border border-input bg-transparent px-2 font-mono text-sm"
              value={row.op}
              onChange={(e) =>
                updateRow(row.id, { op: e.target.value as QueryFormRow["op"] })
              }
            >
              {OPS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <Input
              value={row.value}
              onChange={(e) => updateRow(row.id, { value: e.target.value })}
              placeholder="value"
            />
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={rows.length === 1}
              onClick={() =>
                setRows((prev) => prev.filter((r) => r.id !== row.id))
              }
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => onApply(buildQueryFromForm(rows))}
        >
          Apply query
        </Button>
        {onClose && (
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </div>
  );
}
