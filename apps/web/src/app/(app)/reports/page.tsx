"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { apiDownload, hasPermission } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function ReportsPage() {
  const { user } = useAuth();
  const canRead = hasPermission(user, "scan:read");
  const [format, setFormat] = useState<"html" | "pdf">("html");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      await apiDownload("/reports/executive", {
        method: "POST",
        body: JSON.stringify({ format }),
        filename: format === "pdf" ? "executive-report.pdf" : "executive-report.html",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка генерации";
      if (format === "pdf" && /weasyprint|PDF|501/i.test(msg)) {
        setErr("PDF недоступен (weasyprint). Скачайте HTML или выберите формат HTML.");
      } else {
        setErr(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!canRead) {
    return (
      <div className="space-y-4" data-testid="reports-page">
        <h1 className="font-display text-2xl font-semibold">Отчёты</h1>
        <Card>Нет права scan:read.</Card>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="reports-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Отчёты</h1>
          <p className="mt-1 text-sm text-muted">
            Executive-сводка и шаблоны отчётов
          </p>
        </div>
        <Link
          href="/reports/templates"
          className="text-sm text-accent2 hover:underline"
        >
          Шаблоны →
        </Link>
      </div>

      {err && (
        <Card className="border-danger/40 text-sm text-danger" role="alert">
          {err}
        </Card>
      )}

      <Card className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface2">
            <FileText size={18} className="text-accent2" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold">Executive report</h2>
            <p className="mt-1 text-sm text-muted">
              KPI по открытым находкам, таблица приоритетов и топ активов.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1.5">
            <span className="text-sm text-muted">Формат</span>
            <select
              className="vbx-field"
              value={format}
              onChange={(e) => setFormat(e.target.value as "html" | "pdf")}
            >
              <option value="html">HTML</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
          <Button type="button" disabled={busy} onClick={generate}>
            <Download size={14} />
            {busy ? "Генерация…" : "Скачать"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
