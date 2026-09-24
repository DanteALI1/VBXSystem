"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Pencil, Ticket } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
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
  linked_bdu_ids?: string[];
  cvss_version?: string;
  cvss_score?: number | null;
  cvss_severity?: string;
  cvss_vector?: string;
  is_remote?: boolean;
  cwes?: string[];
  products?: string[];
  references?: string[];
  published_at?: string | null;
  modified_at?: string | null;
  analysis_status?: string;
  discovery_source?: string;
  notes?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

function splitLines(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function LocalDetailPage() {
  const params = useParams();
  const localId = String(params.localId || "");
  const { user } = useAuth();
  const [data, setData] = useState<LocalDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    severity: "MEDIUM",
    vendor: "",
    product_name: "",
    remediation: "",
    cvss_version: "",
    cvss_score: "",
    cvss_vector: "",
    is_remote: false,
    cwes: "",
    products: "",
    references: "",
    linked_cve_ids: "",
    linked_bdu_ids: "",
    analysis_status: "",
    discovery_source: "",
    notes: "",
    status: "open",
  });

  const canWrite =
    !!user &&
    (user.is_super_admin ||
      user.roles.some((r) => ["admin", "analyst", "ticket_manager"].includes(r)));

  function load() {
    if (!localId) return;
    api<LocalDetail>(`/local/${encodeURIComponent(localId)}`)
      .then((d) => {
        setData(d);
        setForm({
          title: d.title || "",
          description: d.description || "",
          severity: d.severity || "MEDIUM",
          vendor: d.vendor || "",
          product_name: d.product_name || "",
          remediation: d.remediation || "",
          cvss_version: d.cvss_version || "",
          cvss_score: d.cvss_score != null ? String(d.cvss_score) : "",
          cvss_vector: d.cvss_vector || "",
          is_remote: !!d.is_remote,
          cwes: (d.cwes || []).join("\n"),
          products: (d.products || []).join("\n"),
          references: (d.references || []).join("\n"),
          linked_cve_ids: (d.linked_cve_ids || []).join("\n"),
          linked_bdu_ids: (d.linked_bdu_ids || []).join("\n"),
          analysis_status: d.analysis_status || "",
          discovery_source: d.discovery_source || "",
          notes: d.notes || "",
          status: d.status || "open",
        });
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Ошибка"));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localId]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const score = form.cvss_score.trim() ? Number(form.cvss_score) : null;
      const updated = await api<LocalDetail>(`/local/${encodeURIComponent(localId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          severity: form.severity,
          vendor: form.vendor,
          product_name: form.product_name,
          remediation: form.remediation,
          cvss_version: form.cvss_version,
          cvss_score: Number.isFinite(score as number) ? score : null,
          cvss_severity: form.severity,
          cvss_vector: form.cvss_vector,
          is_remote: form.is_remote,
          cwes: splitLines(form.cwes),
          products: splitLines(form.products),
          references: splitLines(form.references),
          linked_cve_ids: splitLines(form.linked_cve_ids),
          linked_bdu_ids: splitLines(form.linked_bdu_ids),
          analysis_status: form.analysis_status,
          discovery_source: form.discovery_source,
          notes: form.notes,
          status: form.status,
        }),
      });
      setData(updated);
      setEditing(false);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (err && !data) {
    return (
      <Card className="border-danger/40 text-danger" role="alert">
        {err}
      </Card>
    );
  }
  if (!data) return <div className="text-sm text-muted">Загрузка…</div>;

  const fieldClass =
    "w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent";
  const sev = data.cvss_severity || data.severity;

  return (
    <div className="space-y-5" data-testid="local-detail">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/search" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent2">
          <ArrowLeft size={14} />К поиску
        </Link>
        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <Button type="button" variant="ghost" onClick={() => setEditing((v) => !v)}>
              <Pencil size={14} />
              {editing ? "Отмена" : "Редактировать"}
            </Button>
          )}
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
      </div>

      {editing ? (
        <Card>
          <form className="space-y-4" onSubmit={onSave}>
            <Input
              label="Заголовок"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">Описание</span>
              <textarea
                className={fieldClass}
                rows={5}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block text-muted">Severity</span>
                <select
                  className={fieldClass}
                  value={form.severity}
                  onChange={(e) => setForm({ ...form, severity: e.target.value })}
                >
                  {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Статус"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Вендор"
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              />
              <Input
                label="Продукт"
                value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="CVSS version"
                value={form.cvss_version}
                onChange={(e) => setForm({ ...form, cvss_version: e.target.value })}
              />
              <Input
                label="CVSS score"
                value={form.cvss_score}
                onChange={(e) => setForm({ ...form, cvss_score: e.target.value })}
              />
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_remote}
                  onChange={(e) => setForm({ ...form, is_remote: e.target.checked })}
                />
                Remote
              </label>
            </div>
            <Input
              label="CVSS vector"
              value={form.cvss_vector}
              onChange={(e) => setForm({ ...form, cvss_vector: e.target.value })}
            />
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">CWE</span>
              <textarea
                className={fieldClass}
                rows={2}
                value={form.cwes}
                onChange={(e) => setForm({ ...form, cwes: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">Products</span>
              <textarea
                className={fieldClass}
                rows={2}
                value={form.products}
                onChange={(e) => setForm({ ...form, products: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">References</span>
              <textarea
                className={fieldClass}
                rows={2}
                value={form.references}
                onChange={(e) => setForm({ ...form, references: e.target.value })}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block text-muted">CVE</span>
                <textarea
                  className={fieldClass}
                  rows={2}
                  value={form.linked_cve_ids}
                  onChange={(e) => setForm({ ...form, linked_cve_ids: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-muted">BDU</span>
                <textarea
                  className={fieldClass}
                  rows={2}
                  value={form.linked_bdu_ids}
                  onChange={(e) => setForm({ ...form, linked_bdu_ids: e.target.value })}
                />
              </label>
            </div>
            <Input
              label="Источник"
              value={form.discovery_source}
              onChange={(e) => setForm({ ...form, discovery_source: e.target.value })}
            />
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">Рекомендации</span>
              <textarea
                className={fieldClass}
                rows={3}
                value={form.remediation}
                onChange={(e) => setForm({ ...form, remediation: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">Заметки</span>
              <textarea
                className={fieldClass}
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
            {err ? <p className="text-sm text-danger">{err}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Сохранение…" : "Сохранить"}
            </Button>
          </form>
        </Card>
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-surface/90 p-5 shadow-soft md:p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Local vulnerability</p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{data.id}</h1>
            <p className="mt-2 text-sm text-muted md:text-base">{data.title}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone={severityTone(sev)}>
                {sev}
                {data.cvss_score != null ? ` ${data.cvss_score}` : ""}
              </Badge>
              <Badge tone="accent">LOCAL</Badge>
              {data.status ? <Badge>{data.status}</Badge> : null}
              {data.is_remote ? <Badge tone="warn">Remote</Badge> : null}
              {data.discovery_source ? <Badge tone="neutral">{data.discovery_source}</Badge> : null}
            </div>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border/80 bg-surface2/50 px-3 py-2.5">
                <dt className="text-xs text-muted">Published</dt>
                <dd className="mt-0.5 font-medium">{formatDate(data.published_at || data.created_at)}</dd>
              </div>
              <div className="rounded-xl border border-border/80 bg-surface2/50 px-3 py-2.5">
                <dt className="text-xs text-muted">Modified</dt>
                <dd className="mt-0.5 font-medium">{formatDate(data.modified_at || data.updated_at)}</dd>
              </div>
              <div className="rounded-xl border border-border/80 bg-surface2/50 px-3 py-2.5">
                <dt className="text-xs text-muted">CVSS</dt>
                <dd className="mt-0.5 font-medium">
                  {data.cvss_version || "—"}
                  {data.cvss_score != null ? ` · ${data.cvss_score}` : ""}
                </dd>
              </div>
              <div className="rounded-xl border border-border/80 bg-surface2/50 px-3 py-2.5">
                <dt className="text-xs text-muted">Analysis</dt>
                <dd className="mt-0.5 font-medium">{data.analysis_status || data.status || "—"}</dd>
              </div>
            </dl>
          </div>

          <Card>
            <h2 className="font-display text-lg font-semibold">Описание</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">
              {data.description || "—"}
            </p>
          </Card>

          {data.cvss_vector ? (
            <Card>
              <h2 className="font-display text-lg font-semibold">CVSS vector</h2>
              <p className="mt-2 break-all font-mono text-xs text-muted">{data.cvss_vector}</p>
            </Card>
          ) : null}

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

          {data.cwes && data.cwes.length > 0 ? (
            <Card>
              <h2 className="font-display text-lg font-semibold">CWE</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {data.cwes.map((c) => (
                  <Badge key={c}>{c}</Badge>
                ))}
              </div>
            </Card>
          ) : null}

          {data.products && data.products.length > 0 ? (
            <Card>
              <h2 className="font-display text-lg font-semibold">Products</h2>
              <ul className="mt-2 list-inside list-disc text-sm text-muted">
                {data.products.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Card>
          ) : null}

          {data.remediation ? (
            <Card>
              <h2 className="font-display text-lg font-semibold">Рекомендации</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{data.remediation}</p>
            </Card>
          ) : null}

          {data.notes ? (
            <Card>
              <h2 className="font-display text-lg font-semibold">Заметки</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{data.notes}</p>
            </Card>
          ) : null}

          {data.references && data.references.length > 0 ? (
            <Card>
              <h2 className="font-display text-lg font-semibold">References</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {data.references.map((r) => (
                  <li key={r} className="break-all">
                    {r.startsWith("http") ? (
                      <a href={r} target="_blank" rel="noreferrer" className="text-accent2 hover:underline">
                        {r}
                      </a>
                    ) : (
                      r
                    )}
                  </li>
                ))}
              </ul>
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

          {data.linked_bdu_ids && data.linked_bdu_ids.length > 0 ? (
            <Card>
              <h2 className="font-display text-lg font-semibold">Связанные BDU</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {data.linked_bdu_ids.map((b) => (
                  <Link
                    key={b}
                    href={`/bdu/${encodeURIComponent(b)}`}
                    className="text-sm text-accent2 hover:underline"
                  >
                    {b}
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
