"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Ticket, ArrowLeft, Share2 } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CvssScoringDetails } from "@/components/CvssScoringDetails";
import { formatDate, severityTone } from "@/lib/severity";

type CveDetail = {
  id: string;
  title: string;
  description: string;
  status: string;
  source: string;
  published_at?: string | null;
  modified_at?: string | null;
  cvss: {
    version?: string | null;
    score?: number | null;
    severity?: string | null;
    vector?: string | null;
    is_remote?: boolean | null;
  };
  is_cisa_kev: boolean;
  cwes: string[];
  products: unknown[];
  references: unknown[];
  kev?: {
    vendor_project?: string;
    product?: string;
    vulnerability_name?: string;
    date_added?: string;
    due_date?: string;
    required_action?: string;
    known_ransomware?: string;
    notes?: string;
  } | null;
  epss?: { score?: number; percentile?: number; scored_at?: string } | null;
  bdu: Array<{
    id: string;
    name?: string;
    description?: string;
    severity?: string;
    status?: string;
    solution?: string;
    vendors?: string;
    software_names?: string;
    identify_date?: string;
  }>;
  exploits?: Array<{
    xdb_id: string;
    cve_id?: string | null;
    published_at?: string | null;
    repo_url: string;
    repo_name: string;
    author: string;
    source?: string;
  }>;
};

function refUrl(ref: unknown): string | null {
  if (typeof ref === "string") return ref;
  if (ref && typeof ref === "object" && "url" in ref) {
    const u = (ref as { url?: string }).url;
    return u || null;
  }
  return null;
}

function productLabel(p: unknown): string {
  if (typeof p === "string") return p;
  if (p && typeof p === "object") {
    const o = p as Record<string, unknown>;
    return String(o.criteria || o.product || o.name || JSON.stringify(p));
  }
  return String(p);
}

function groupProducts(products: unknown[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const p of products) {
    const label = productLabel(p);
    // CPE 2.3: cpe:2.3:a:vendor:product:...
    const m = label.match(/^cpe:2\.3:[aho]:([^:]+):([^:]+)/i);
    const vendor = m ? m[1] : "Other";
    const product = m ? m[2] : label;
    if (!groups[vendor]) groups[vendor] = [];
    if (!groups[vendor].includes(product)) groups[vendor].push(product);
  }
  return groups;
}

function Section({
  id,
  title,
  children,
  tone,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
  tone?: "warn" | "accent" | "default";
}) {
  const border =
    tone === "warn"
      ? "border-warn/40 bg-warn/5"
      : tone === "accent"
        ? "border-accent/30"
        : "border-border";
  return (
    <Card id={id} className={border}>
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

export default function VulnDetailPage() {
  const params = useParams();
  const cveId = String(params.cveId || "");
  const [data, setData] = useState<CveDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cveId) return;
    setLoading(true);
    api<CveDetail>(`/vuln/${encodeURIComponent(cveId)}`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoading(false));
  }, [cveId]);

  const productGroups = useMemo(
    () => (data?.products?.length ? groupProducts(data.products) : {}),
    [data],
  );
  const solutions = useMemo(() => {
    if (!data) return [] as string[];
    return data.bdu.map((b) => b.solution).filter(Boolean) as string[];
  }, [data]);

  if (loading) return <div className="text-sm text-muted">Загрузка карточки CVE…</div>;
  if (err) {
    return (
      <Card className="border-danger/40 text-danger" role="alert">
        {err}
      </Card>
    );
  }
  if (!data) return null;

  const summary =
    data.title && data.title !== data.id ? data.title : data.description.slice(0, 160);

  return (
    <div className="space-y-6" data-testid="cve-detail">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/search"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-accent2"
        >
          <ArrowLeft size={14} />К поиску
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              window.location.href = `/tickets?cve=${encodeURIComponent(data.id)}`;
            }}
          >
            <Ticket size={14} />
            Создать заявку
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(window.location.href);
            }}
            aria-label="Скопировать ссылку"
          >
            <Share2 size={14} />
            Share
          </Button>
        </div>
      </div>

      {/* Header */}
      <div className="rounded-2xl border border-border bg-surface/90 p-5 shadow-soft md:p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Vulnerability</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight md:text-4xl">
          {data.id}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted md:text-base">{summary}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.cvss.severity && (
            <Badge tone={severityTone(data.cvss.severity)}>
              {data.cvss.severity}
              {data.cvss.score != null ? ` ${data.cvss.score}` : ""}
            </Badge>
          )}
          {data.is_cisa_kev && (
            <Badge tone="warn">
              <AlertTriangle size={10} className="mr-1" aria-hidden />
              Actively Exploited (KEV)
            </Badge>
          )}
          {data.bdu.length > 0 && <Badge tone="accent">BDU ×{data.bdu.length}</Badge>}
          {(data.exploits?.length || 0) > 0 && (
            <Badge tone="neutral">XDB ×{data.exploits!.length}</Badge>
          )}
          {data.status && <Badge>{data.status}</Badge>}
          {data.source && <Badge tone="neutral">{data.source}</Badge>}
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border/80 bg-surface2/50 px-3 py-2.5">
            <dt className="text-xs text-muted">Published</dt>
            <dd className="mt-0.5 font-medium">{formatDate(data.published_at)}</dd>
          </div>
          <div className="rounded-xl border border-border/80 bg-surface2/50 px-3 py-2.5">
            <dt className="text-xs text-muted">Last modified</dt>
            <dd className="mt-0.5 font-medium">{formatDate(data.modified_at)}</dd>
          </div>
          <div className="rounded-xl border border-border/80 bg-surface2/50 px-3 py-2.5">
            <dt className="text-xs text-muted">Status</dt>
            <dd className="mt-0.5 font-medium">{data.status || "—"}</dd>
          </div>
          <div className="rounded-xl border border-border/80 bg-surface2/50 px-3 py-2.5">
            <dt className="text-xs text-muted">Source</dt>
            <dd className="mt-0.5 font-medium">{data.source || "—"}</dd>
          </div>
        </dl>
      </div>

      {/* Main + Scoring */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Section title="Description">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{data.description}</p>
          </Section>

          {data.kev && (
            <Section title="CISA Known Exploited Vulnerability" tone="warn">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted">Vulnerability</dt>
                  <dd className="mt-0.5 font-medium">{data.kev.vulnerability_name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Vendor / Product</dt>
                  <dd className="mt-0.5">
                    {data.kev.vendor_project || "—"} / {data.kev.product || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Date added</dt>
                  <dd className="mt-0.5">{data.kev.date_added || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Due date</dt>
                  <dd className="mt-0.5">{data.kev.due_date || "—"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted">Required action</dt>
                  <dd className="mt-0.5">{data.kev.required_action || "—"}</dd>
                </div>
                {data.kev.known_ransomware && (
                  <div>
                    <dt className="text-xs text-muted">Known ransomware use</dt>
                    <dd className="mt-0.5">{data.kev.known_ransomware}</dd>
                  </div>
                )}
                {data.kev.notes && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted">Notes</dt>
                    <dd className="mt-0.5 text-muted">{data.kev.notes}</dd>
                  </div>
                )}
              </dl>
            </Section>
          )}

          {data.cwes?.length > 0 && (
            <Section title="CWEs">
              <div className="flex flex-wrap gap-2">
                {data.cwes.map((c) => (
                  <Badge key={typeof c === "string" ? c : JSON.stringify(c)}>
                    {typeof c === "string" ? c : JSON.stringify(c)}
                  </Badge>
                ))}
              </div>
            </Section>
          )}

          {Object.keys(productGroups).length > 0 && (
            <Section title={`Affected products (${data.products.length} total)`}>
              <div className="space-y-4">
                {Object.entries(productGroups).map(([vendor, products]) => (
                  <div key={vendor}>
                    <h3 className="text-sm font-semibold text-text">
                      {vendor}{" "}
                      <span className="font-normal text-muted">({products.length})</span>
                    </h3>
                    <ul className="mt-1.5 list-inside list-disc text-sm text-muted">
                      {products.map((p) => (
                        <li key={p} className="break-all">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {data.epss && (
            <Section title="EPSS — Exploit Prediction">
              <div className="flex flex-wrap items-end gap-6">
                <div>
                  <div className="text-xs text-muted">Score</div>
                  <div className="font-display text-3xl font-semibold tabular-nums">
                    {((data.epss.score ?? 0) * 100).toFixed(2)}%
                  </div>
                </div>
                {data.epss.percentile != null && (
                  <div>
                    <div className="text-xs text-muted">Percentile</div>
                    <div className="font-display text-2xl font-semibold">
                      p{Math.round(data.epss.percentile * 100)}
                    </div>
                  </div>
                )}
                {data.epss.scored_at && (
                  <div className="text-xs text-muted">scored at {data.epss.scored_at}</div>
                )}
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface2">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.min(100, (data.epss.score ?? 0) * 100)}%` }}
                />
              </div>
            </Section>
          )}

          {data.bdu.length > 0 && (
            <Section title="БДУ (ФСТЭК)" tone="accent">
              <div className="space-y-4" data-testid="bdu-panel">
                {data.bdu.map((b) => (
                  <div key={b.id} className="rounded-xl border border-border bg-surface2/50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/bdu/${encodeURIComponent(b.id)}`}
                        className="font-semibold text-accent2 hover:underline"
                      >
                        {b.id}
                      </Link>
                      {b.severity && <Badge tone={severityTone(b.severity)}>{b.severity}</Badge>}
                      {b.status && <Badge>{b.status}</Badge>}
                    </div>
                    {b.name && <p className="mt-1 text-sm font-medium">{b.name}</p>}
                    {b.description && <p className="mt-2 text-sm text-muted">{b.description}</p>}
                    {b.solution && (
                      <p className="mt-2 text-sm">
                        <span className="text-muted">Решение: </span>
                        {b.solution}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted">
                      {[b.vendors, b.software_names, b.identify_date].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {(data.exploits?.length || 0) > 0 && (
            <Section title="Related exploits (XDB)">
              <ul className="space-y-2 text-sm" data-testid="exploits-panel">
                {data.exploits!.map((e) => (
                  <li
                    key={e.xdb_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                  >
                    <div>
                      <div className="font-mono text-xs text-muted">{e.xdb_id}</div>
                      <div className="font-medium">{e.repo_name || e.author || "repo"}</div>
                      <div className="text-xs text-muted">{e.author}</div>
                    </div>
                    {e.repo_url ? (
                      <a
                        href={e.repo_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-accent2 hover:underline"
                      >
                        Repository
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <Link href="/xdb" className="text-accent2 hover:underline">
                        XDB
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {solutions.length > 0 && (
            <Section title="Solution / mitigations">
              <ul className="list-inside list-disc space-y-1 text-sm text-muted">
                {solutions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </Section>
          )}

          {data.references?.length > 0 && (
            <Section title="References">
              <ul className="space-y-1.5 text-sm">
                {data.references.map((r, i) => {
                  const url = refUrl(r);
                  return (
                    <li key={i}>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 break-all text-accent2 hover:underline"
                        >
                          {url}
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="text-muted">{JSON.stringify(r)}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}
        </div>

        {/* Sticky scoring column */}
        <aside className="xl:sticky xl:top-20 xl:self-start">
          <Card className="border-border/80 shadow-soft">
            <CvssScoringDetails
              score={data.cvss.score}
              severity={data.cvss.severity}
              version={data.cvss.version}
              vector={data.cvss.vector}
              isRemote={data.cvss.is_remote}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}
