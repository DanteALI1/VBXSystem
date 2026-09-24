"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Ticket } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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

  if (loading) return <div className="text-sm text-muted">Загрузка карточки CVE…</div>;
  if (err) {
    return (
      <Card className="border-danger/40 text-danger" role="alert">
        {err}
      </Card>
    );
  }
  if (!data) return null;

  const solution = data.bdu.map((b) => b.solution).filter(Boolean).join("\n") || null;

  return (
    <div className="mx-auto max-w-4xl space-y-5" data-testid="cve-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Vulnerability</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{data.id}</h1>
          <p className="mt-1 text-muted">{data.title !== data.id ? data.title : data.description.slice(0, 120)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.cvss.severity && (
              <Badge tone={severityTone(data.cvss.severity)} aria-label={`Severity ${data.cvss.severity}`}>
                {data.cvss.severity}
                {data.cvss.score != null ? ` ${data.cvss.score}` : ""}
              </Badge>
            )}
            {data.is_cisa_kev && (
              <Badge tone="warn" aria-label="CISA KEV">
                <AlertTriangle size={10} className="mr-1" aria-hidden />
                KEV
              </Badge>
            )}
            {data.bdu.length > 0 && (
              <Badge tone="accent" aria-label="Есть БДУ">
                BDU ×{data.bdu.length}
              </Badge>
            )}
            {(data.exploits?.length || 0) > 0 && (
              <Badge tone="neutral" aria-label="Связанные exploits">
                XDB ×{data.exploits!.length}
              </Badge>
            )}
            {data.status && <Badge>{data.status}</Badge>}
            {data.source && <Badge tone="neutral">{data.source}</Badge>}
          </div>
        </div>
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
      </div>

      <div className="grid gap-4 sm:grid-cols-3 text-sm">
        <Card className="p-4">
          <div className="text-muted">Published</div>
          <div className="mt-1 font-medium">{formatDate(data.published_at)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-muted">Modified</div>
          <div className="mt-1 font-medium">{formatDate(data.modified_at)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-muted">CVSS {data.cvss.version || ""}</div>
          <div className="mt-1 font-medium">
            {data.cvss.score ?? "—"}
            {data.cvss.is_remote ? " · remote" : ""}
          </div>
          {data.cvss.vector && (
            <code className="mt-2 block break-all text-xs text-muted">{data.cvss.vector}</code>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="font-display text-lg font-semibold">Description</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{data.description}</p>
      </Card>

      {data.cwes?.length > 0 && (
        <Card>
          <h2 className="font-display text-lg font-semibold">CWE</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.cwes.map((c) => (
              <Badge key={c}>{typeof c === "string" ? c : JSON.stringify(c)}</Badge>
            ))}
          </div>
        </Card>
      )}

      {data.products?.length > 0 && (
        <Card>
          <h2 className="font-display text-lg font-semibold">Affected products</h2>
          <ul className="mt-2 list-inside list-disc text-sm text-muted">
            {data.products.map((p, i) => (
              <li key={i}>{typeof p === "string" ? p : JSON.stringify(p)}</li>
            ))}
          </ul>
        </Card>
      )}

      {data.kev && (
        <Card className="border-warn/40 bg-warn/5">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-warn">
            <AlertTriangle size={18} aria-hidden />
            CISA KEV
          </h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Vulnerability</dt>
              <dd>{data.kev.vulnerability_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Vendor / Product</dt>
              <dd>
                {data.kev.vendor_project || "—"} / {data.kev.product || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Date added</dt>
              <dd>{data.kev.date_added || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Due date</dt>
              <dd>{data.kev.due_date || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted">Required action</dt>
              <dd>{data.kev.required_action || "—"}</dd>
            </div>
            {data.kev.known_ransomware && (
              <div>
                <dt className="text-muted">Known ransomware</dt>
                <dd>{data.kev.known_ransomware}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      {data.epss && (
        <Card>
          <h2 className="font-display text-lg font-semibold">EPSS</h2>
          <p className="mt-2 text-sm">
            Score: <strong>{((data.epss.score ?? 0) * 100).toFixed(2)}%</strong>
            {data.epss.percentile != null && (
              <>
                {" "}
                · percentile p{Math.round(data.epss.percentile * 100)}
              </>
            )}
          </p>
        </Card>
      )}

      {data.bdu.length > 0 && (
        <Card className="border-accent/30" data-testid="bdu-panel">
          <h2 className="font-display text-lg font-semibold">БДУ (ФСТЭК)</h2>
          <div className="mt-3 space-y-4">
            {data.bdu.map((b) => (
              <div key={b.id} className="rounded-xl border border-border bg-surface2/50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/bdu/${encodeURIComponent(b.id)}`} className="font-semibold text-accent2 hover:underline">
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
        </Card>
      )}

      {(data.exploits?.length || 0) > 0 && (
        <Card data-testid="exploits-panel">
          <h2 className="font-display text-lg font-semibold">Related exploits (XDB)</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.exploits!.map((e) => (
              <li key={e.xdb_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
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
        </Card>
      )}

      {solution && (
        <Card>
          <h2 className="font-display text-lg font-semibold">Solution / mitigations</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{solution}</p>
        </Card>
      )}

      {data.references?.length > 0 && (
        <Card>
          <h2 className="font-display text-lg font-semibold">References</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {data.references.map((r, i) => {
              const url = refUrl(r);
              return (
                <li key={i}>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent2 hover:underline">
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
