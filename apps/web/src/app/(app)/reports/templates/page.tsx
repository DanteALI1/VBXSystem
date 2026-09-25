"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { api, apiDownload, hasPermission } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatDate } from "@/lib/severity";

type SectionType =
  | "title"
  | "kpi"
  | "findings_table"
  | "top_assets"
  | "page_break"
  | "custom"
  | "markdown";

type Section = {
  type: SectionType;
  text?: string;
  html?: string;
};

type Template = {
  id: number;
  name: string;
  sections: Section[];
  updated_by?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const SECTION_TYPES: { value: SectionType; label: string }[] = [
  { value: "title", label: "title" },
  { value: "kpi", label: "kpi" },
  { value: "findings_table", label: "findings_table" },
  { value: "top_assets", label: "top_assets" },
  { value: "page_break", label: "page_break" },
  { value: "custom", label: "custom" },
  { value: "markdown", label: "markdown" },
];

const DEFAULT_SECTIONS: Section[] = [
  { type: "title", text: "VBX Executive Report" },
  { type: "kpi" },
  { type: "findings_table" },
  { type: "top_assets" },
];

export default function ReportTemplatesPage() {
  const { user } = useAuth();
  const canRead = hasPermission(user, "scan:read");
  const canWrite =
    hasPermission(user, "scan:run") || hasPermission(user, "settings:write");

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("Executive");
  const [sections, setSections] = useState<Section[]>(DEFAULT_SECTIONS);
  const [addType, setAddType] = useState<SectionType>("kpi");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await api<Template[]>("/report-templates");
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    void load();
  }, [canRead, load]);

  function loadTemplate(t: Template) {
    setEditId(t.id);
    setName(t.name);
    setSections(
      Array.isArray(t.sections) && t.sections.length
        ? t.sections
        : DEFAULT_SECTIONS,
    );
    setPreviewHtml("");
  }

  function newTemplate() {
    setEditId(null);
    setName("Новый шаблон");
    setSections([...DEFAULT_SECTIONS]);
    setPreviewHtml("");
  }

  function moveSection(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= sections.length) return;
    setSections((prev) => {
      const copy = [...prev];
      const tmp = copy[idx];
      copy[idx] = copy[next];
      copy[next] = tmp;
      return copy;
    });
  }

  function removeSection(idx: number) {
    setSections((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateSection(idx: number, patch: Partial<Section>) {
    setSections((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  }

  function addSection() {
    const base: Section = { type: addType };
    if (addType === "title") base.text = "Заголовок";
    if (addType === "markdown") base.text = "## Markdown";
    if (addType === "custom") base.html = "<p>Custom HTML</p>";
    setSections((prev) => [...prev, base]);
  }

  async function onSave(e?: FormEvent) {
    e?.preventDefault();
    if (!canWrite) return;
    setSaveBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const body = {
        name: name.trim() || "Report",
        sections,
        ...(editId != null ? { template_id: editId, id: editId } : {}),
      };
      const saved = await api<Template>("/report-templates", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setEditId(saved.id);
      setMsg("Шаблон сохранён");
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка сохранения");
    } finally {
      setSaveBusy(false);
    }
  }

  async function onDelete(id: number) {
    if (!canWrite) return;
    if (!window.confirm("Удалить шаблон?")) return;
    setErr(null);
    try {
      await api(`/report-templates/${id}`, { method: "DELETE" });
      if (editId === id) newTemplate();
      setMsg("Шаблон удалён");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка удаления");
    }
  }

  async function onPreview() {
    setPreviewBusy(true);
    setErr(null);
    try {
      const res = await api<{ html?: string } | string>("/reports/preview", {
        method: "POST",
        body: JSON.stringify({ sections }),
      });
      const html =
        typeof res === "string"
          ? res
          : typeof res?.html === "string"
            ? res.html
            : "";
      setPreviewHtml(html || "<p>Пустой preview</p>");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка preview");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function onPdf() {
    setPdfBusy(true);
    setErr(null);
    try {
      await apiDownload("/reports/executive", {
        method: "POST",
        body: JSON.stringify({ format: "pdf", sections }),
        filename: `${(name || "report").replace(/\s+/g, "-")}.pdf`,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  if (!canRead) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-semibold">Шаблоны отчётов</h1>
        <Card>Нет права scan:read.</Card>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="report-templates-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Шаблоны отчётов
          </h1>
          <p className="mt-1 text-sm text-muted">
            Секции с перестановкой и live HTML preview
          </p>
        </div>
        <Link href="/reports" className="text-sm text-accent2 hover:underline">
          ← Отчёты
        </Link>
      </div>

      {err && (
        <Card className="border-danger/40 text-sm text-danger" role="alert">
          {err}
        </Card>
      )}
      {msg && (
        <Card className="text-sm text-ok" role="status">
          {msg}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card className="space-y-2 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Список</span>
            {canWrite ? (
              <Button type="button" variant="ghost" onClick={newTemplate}>
                <Plus size={14} />
              </Button>
            ) : null}
          </div>
          {loading && <p className="text-xs text-muted">Загрузка…</p>}
          <ul className="space-y-1">
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm ${
                    editId === t.id
                      ? "bg-accent/15 text-accent2"
                      : "hover:bg-surface2 text-text"
                  }`}
                  onClick={() => loadTemplate(t)}
                >
                  <span className="truncate">{t.name}</span>
                  {canWrite ? (
                    <span
                      role="button"
                      tabIndex={0}
                      className="text-muted hover:text-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onDelete(t.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          void onDelete(t.id);
                        }
                      }}
                    >
                      <Trash2 size={12} />
                    </span>
                  ) : null}
                </button>
                <div className="px-2 text-[10px] text-muted">
                  {formatDate(t.updated_at || t.created_at)}
                </div>
              </li>
            ))}
          </ul>
          {!loading && !templates.length && (
            <p className="text-xs text-muted">Нет шаблонов</p>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="space-y-3">
            <Input
              label="Название шаблона"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canWrite}
            />
            <div className="space-y-2">
              <div className="text-sm font-medium">Секции</div>
              {sections.map((s, idx) => (
                <div
                  key={`${s.type}-${idx}`}
                  className="flex flex-wrap items-start gap-2 rounded-xl border border-border bg-surface2/30 p-3"
                >
                  <Badge>{s.type}</Badge>
                  <div className="min-w-0 flex-1 space-y-2">
                    {(s.type === "title" ||
                      s.type === "markdown" ||
                      s.type === "custom") && (
                      <textarea
                        className="vbx-field min-h-[60px] w-full text-sm"
                        value={s.type === "custom" ? s.html || "" : s.text || ""}
                        disabled={!canWrite}
                        onChange={(e) =>
                          updateSection(
                            idx,
                            s.type === "custom"
                              ? { html: e.target.value }
                              : { text: e.target.value },
                          )
                        }
                        placeholder={
                          s.type === "custom" ? "HTML…" : "Текст…"
                        }
                      />
                    )}
                    {s.type === "page_break" && (
                      <span className="text-xs text-muted">Разрыв страницы</span>
                    )}
                    {(s.type === "kpi" ||
                      s.type === "findings_table" ||
                      s.type === "top_assets") && (
                      <span className="text-xs text-muted">Авто-блок данных</span>
                    )}
                  </div>
                  {canWrite ? (
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => moveSection(idx, -1)}
                        disabled={idx === 0}
                        title="Выше"
                      >
                        <ArrowUp size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => moveSection(idx, 1)}
                        disabled={idx === sections.length - 1}
                        title="Ниже"
                      >
                        <ArrowDown size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeSection(idx)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {canWrite ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="block space-y-1.5">
                  <span className="text-sm text-muted">Добавить секцию</span>
                  <select
                    className="vbx-field"
                    value={addType}
                    onChange={(e) => setAddType(e.target.value as SectionType)}
                  >
                    {SECTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="button" variant="secondary" onClick={addSection}>
                  <Plus size={14} />
                  Добавить
                </Button>
                <Button type="button" disabled={saveBusy} onClick={() => onSave()}>
                  <Save size={14} />
                  {saveBusy ? "…" : "Сохранить"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={previewBusy}
                  onClick={onPreview}
                >
                  <Eye size={14} />
                  Preview
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pdfBusy}
                  onClick={onPdf}
                >
                  <Download size={14} />
                  PDF
                </Button>
              </div>
            ) : null}
          </Card>

          {previewHtml ? (
            <Card className="space-y-2 p-0 overflow-hidden">
              <div className="border-b border-border px-4 py-2 text-sm font-medium">
                Live preview
              </div>
              <iframe
                title="Report preview"
                className="h-[480px] w-full bg-white"
                srcDoc={previewHtml}
                sandbox=""
              />
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
