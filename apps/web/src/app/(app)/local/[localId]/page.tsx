"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Ticket } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatDate, severityTone } from "@/lib/severity";

type LocalDetail = {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  vendor: string;
  product_name: string;
  remediation: string;
  linked_cve_ids: string[];
  created_at?: string | null;
  updated_at?: string | null;
};

export default function LocalDetailPage() {
  const params = useParams();
  const localId = String(params.localId || "");
  const [data, setData] = useState<LocalDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!localId) return;
    api<LocalDetail>(`/local/${encodeURIComponent(localId)}`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Ошибка"));
  }, [localId]);

  if (err) {
    return (
      <Card className="border-danger/40 text-danger" role="alert">
        {err}
      </Card>
    );
  }
  if (!data) return <div className="text-sm text-muted">Загрузка…</div>;

  return (
    <div className="space-y-5" data-testid="local-detail">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/search" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent2">
          <ArrowLeft size={14} />К поиску
        </Link>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            window.location.href = `/tickets?local=${encodeURIComponent(data.id)}`;
          }}
        >
          <Ticket size={14} />
          Создать заявку
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-surface/90 p-5 shadow-soft md:p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Local vulnerability</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{data.id}</h1>
        <p className="mt-2 text-sm text-muted md:text-base">{data.title}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone={severityTone(data.severity)}>{data.severity}</Badge>
          <Badge tone="accent">LOCAL</Badge>
          {data.status ? <Badge>{data.status}</Badge> : null}
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-border/80 bg-surface2/50 px-3 py-2.5">
            <dt className="text-xs text-muted">Created</dt>
            <dd className="mt-0.5 font-medium">{formatDate(data.created_at)}</dd>
          </div>
          <div className="rounded-xl border border-border/80 bg-surface2/50 px-3 py-2.5">
            <dt className="text-xs text-muted">Updated</dt>
            <dd className="mt-0.5 font-medium">{formatDate(data.updated_at)}</dd>
          </div>
        </dl>
      </div>

      <Card>
        <h2 className="font-display text-lg font-semibold">Описание</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">
          {data.description || "—"}
        </p>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold">Актив / вендор</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Вендор</dt>
            <dd className="mt-0.5">{data.vendor || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Продукт</dt>
            <dd className="mt-0.5">{data.product_name || "—"}</dd>
          </div>
        </dl>
      </Card>

      {data.remediation ? (
        <Card>
          <h2 className="font-display text-lg font-semibold">Рекомендации</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{data.remediation}</p>
        </Card>
      ) : null}

      {data.linked_cve_ids?.length ? (
        <Card>
          <h2 className="font-display text-lg font-semibold">Связанные CVE</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.linked_cve_ids.map((c) => (
              <Link key={c} href={`/vuln/${c}`} className="text-sm text-accent2 hover:underline">
                {c}
              </Link>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
