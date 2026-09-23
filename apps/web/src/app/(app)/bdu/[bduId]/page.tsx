"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Ticket } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { severityTone } from "@/lib/severity";

type BduDetail = {
  id: string;
  name: string;
  description: string;
  severity: string;
  severity_level?: number | null;
  status: string;
  solution: string;
  vendors: string;
  software_names: string;
  cwes: string;
  linked_cve_ids: string[];
  identify_date: string;
  is_standalone: boolean;
};

export default function BduDetailPage() {
  const params = useParams();
  const raw = params.bduId;
  const bduId = decodeURIComponent(Array.isArray(raw) ? raw.join("/") : String(raw || ""));
  const [data, setData] = useState<BduDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bduId) return;
    setLoading(true);
    api<BduDetail>(`/bdu/${encodeURIComponent(bduId)}`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoading(false));
  }, [bduId]);

  if (loading) return <div className="text-sm text-muted">Загрузка карточки БДУ…</div>;
  if (err) {
    return (
      <Card className="border-danger/40 text-danger" role="alert">
        {err}
      </Card>
    );
  }
  if (!data) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-5" data-testid="bdu-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">БДУ ФСТЭК</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{data.id}</h1>
          <p className="mt-1 text-muted">{data.name}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.severity && (
              <Badge tone={severityTone(data.severity)} aria-label={`Severity ${data.severity}`}>
                {data.severity}
                {data.severity_level != null ? ` · L${data.severity_level}` : ""}
              </Badge>
            )}
            {data.status && <Badge>{data.status}</Badge>}
            <Badge tone={data.is_standalone ? "accent" : "neutral"}>
              {data.is_standalone ? "Standalone" : "Linked"}
            </Badge>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            window.location.href = `/tickets?bdu=${encodeURIComponent(data.id)}`;
          }}
        >
          <Ticket size={14} />
          Создать заявку
        </Button>
      </div>

      <Card>
        <h2 className="font-display text-lg font-semibold">Описание</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">
          {data.description || "—"}
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4 text-sm">
          <div className="text-muted">Вендоры</div>
          <div className="mt-1">{data.vendors || "—"}</div>
        </Card>
        <Card className="p-4 text-sm">
          <div className="text-muted">ПО</div>
          <div className="mt-1">{data.software_names || "—"}</div>
        </Card>
        <Card className="p-4 text-sm">
          <div className="text-muted">Дата выявления</div>
          <div className="mt-1">{data.identify_date || "—"}</div>
        </Card>
        <Card className="p-4 text-sm">
          <div className="text-muted">CWE</div>
          <div className="mt-1">{data.cwes || "—"}</div>
        </Card>
      </div>

      {data.solution && (
        <Card>
          <h2 className="font-display text-lg font-semibold">Решение</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{data.solution}</p>
        </Card>
      )}

      {data.linked_cve_ids?.length > 0 && (
        <Card>
          <h2 className="font-display text-lg font-semibold">Связанные CVE</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.linked_cve_ids.map((cve) => (
              <li key={cve}>
                <Link href={`/vuln/${encodeURIComponent(cve)}`} className="text-accent2 hover:underline">
                  {cve}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-sm">
        <Link href="/search" className="text-accent2 hover:underline">
          ← К поиску
        </Link>
      </p>
    </div>
  );
}
