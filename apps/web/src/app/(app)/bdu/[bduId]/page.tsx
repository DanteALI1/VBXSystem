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
  software_versions?: string;
  software_type?: string;
  os_platform?: string;
  vuln_class?: string;
  cvss2_vector?: string;
  cvss3_vector?: string;
  cvss4_vector?: string;
  exploit_status?: string;
  fix_info?: string;
  exploit_method?: string;
  fix_method?: string;
  references?: string[];
  published_date?: string;
  updated_date?: string;
  cwe_description?: string;
  cwes: string;
  linked_cve_ids: string[];
  identify_date: string;
  is_standalone: boolean;
};

function Meta({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-xl border border-border/80 bg-surface2/50 px-3 py-2.5 text-sm">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 whitespace-pre-wrap break-words">{value}</div>
    </div>
  );
}

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

  const vectors = [
    { label: "CVSS 2.0", v: data.cvss2_vector },
    { label: "CVSS 3.x", v: data.cvss3_vector },
    { label: "CVSS 4.0", v: data.cvss4_vector },
  ].filter((x) => x.v);

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
            {data.vuln_class && <Badge tone="neutral">{data.vuln_class}</Badge>}
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

      <div className="grid gap-3 sm:grid-cols-2">
        <Meta label="Вендоры" value={data.vendors} />
        <Meta label="ПО" value={data.software_names} />
        <Meta label="Версии ПО" value={data.software_versions} />
        <Meta label="Тип ПО" value={data.software_type} />
        <Meta label="ОС / платформа" value={data.os_platform} />
        <Meta label="Дата выявления" value={data.identify_date} />
        <Meta label="Дата публикации" value={data.published_date} />
        <Meta label="Дата обновления" value={data.updated_date} />
        <Meta label="CWE" value={data.cwes} />
        <Meta label="Описание CWE" value={data.cwe_description} />
        <Meta label="Статус эксплуатации" value={data.exploit_status} />
        <Meta label="Способ эксплуатации" value={data.exploit_method} />
        <Meta label="Способ устранения" value={data.fix_method} />
      </div>

      {vectors.length > 0 && (
        <Card>
          <h2 className="font-display text-lg font-semibold">CVSS (векторы ФСТЭК)</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {vectors.map((x) => (
              <div key={x.label}>
                <dt className="text-xs text-muted">{x.label}</dt>
                <dd className="mt-0.5 break-all font-mono text-xs">{x.v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {(data.solution || data.fix_info) && (
        <Card>
          <h2 className="font-display text-lg font-semibold">Решение / устранение</h2>
          {data.solution && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{data.solution}</p>
          )}
          {data.fix_info && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{data.fix_info}</p>
          )}
        </Card>
      )}

      {data.references && data.references.length > 0 && (
        <Card>
          <h2 className="font-display text-lg font-semibold">Ссылки</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
            {data.references.map((ref) => (
              <li key={ref} className="break-all">
                {ref.startsWith("http") ? (
                  <a href={ref} target="_blank" rel="noreferrer" className="text-accent2 hover:underline">
                    {ref}
                  </a>
                ) : (
                  ref
                )}
              </li>
            ))}
          </ul>
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
