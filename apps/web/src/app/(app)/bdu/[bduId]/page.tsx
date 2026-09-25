"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Ticket } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CvssScoringDetails } from "@/components/CvssScoringDetails";
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
      <div className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words">{value}</div>
    </div>
  );
}

function scoreFromText(text: string, versionHint?: string): number | null {
  if (!text) return null;
  const norm = text.replace(/,/g, ".");
  if (versionHint) {
    const esc = versionHint.replace(".", "\\.");
    const m = norm.match(
      new RegExp(`CVSS\\s*${esc}[^\\d]{0,40}?(\\d{1,2}(?:\\.\\d+)?)`, "i"),
    );
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 0 && n <= 10) return n;
    }
  }
  const m2 = norm.match(/составляет\s+(\d{1,2}(?:\.\d+)?)/i);
  if (m2) {
    const n = Number(m2[1]);
    if (Number.isFinite(n) && n >= 0 && n <= 10) return n;
  }
  return null;
}

function levelToScore(level?: number | null): number | null {
  if (level == null) return null;
  // FSTEC severity_level often 1..4 (info→critical)
  const map: Record<number, number> = { 1: 2.0, 2: 5.0, 3: 7.5, 4: 9.5 };
  return map[level] ?? null;
}

function pickPrimaryCvss(data: BduDetail): {
  vector: string;
  version: string;
  score: number | null;
} | null {
  const candidates: { vector: string; version: string; hint: string }[] = [];
  if (data.cvss3_vector?.trim()) {
    candidates.push({ vector: data.cvss3_vector.trim(), version: "3.1", hint: "3\\.1|3\\.0|3" });
  }
  if (data.cvss4_vector?.trim()) {
    candidates.push({ vector: data.cvss4_vector.trim(), version: "4.0", hint: "4\\.0|4" });
  }
  if (data.cvss2_vector?.trim()) {
    candidates.push({ vector: data.cvss2_vector.trim(), version: "2.0", hint: "2\\.0|2" });
  }
  const primary = candidates[0];
  if (!primary) return null;

  const fromSev =
    scoreFromText(data.severity, primary.version) ??
    scoreFromText(data.severity) ??
    levelToScore(data.severity_level);

  return { vector: primary.vector, version: primary.version, score: fromSev };
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

  const primary = useMemo(() => (data ? pickPrimaryCvss(data) : null), [data]);

  const scoreBadges = useMemo(() => {
    if (!data) return [];
    const out: { label: string; score: number | null }[] = [];
    if (data.cvss2_vector?.trim()) {
      out.push({
        label: "CVSS 2.0",
        score: scoreFromText(data.severity, "2.0") ?? scoreFromText(data.severity, "2"),
      });
    }
    if (data.cvss3_vector?.trim()) {
      out.push({
        label: "CVSS 3.1",
        score:
          scoreFromText(data.severity, "3.1") ??
          scoreFromText(data.severity, "3.0") ??
          scoreFromText(data.severity, "3"),
      });
    }
    if (data.cvss4_vector?.trim()) {
      out.push({
        label: "CVSS 4.0",
        score: scoreFromText(data.severity, "4.0") ?? scoreFromText(data.severity, "4"),
      });
    }
    return out;
  }, [data]);

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
    <div className="mx-auto max-w-6xl space-y-5" data-testid="bdu-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
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
            {scoreBadges.map((b) =>
              b.score != null ? (
                <Badge key={b.label} tone={severityTone(data.severity)}>
                  {b.label}: {b.score}
                </Badge>
              ) : null,
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="min-w-0 space-y-5">
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

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <Card className="border-border/80 shadow-soft" data-testid="bdu-scoring">
            {primary ? (
              <CvssScoringDetails
                score={primary.score}
                severity={data.severity}
                version={primary.version}
                vector={primary.vector}
              />
            ) : (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">Scoring</div>
                <h2 className="font-display text-lg font-semibold">Vulnerability Scoring Details</h2>
                <p className="text-sm text-muted">
                  Вектор CVSS в записи БДУ отсутствует — диаграмма недоступна.
                </p>
              </div>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
