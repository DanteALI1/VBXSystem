"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

function splitLines(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function LocalCreatePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [vendor, setVendor] = useState("");
  const [product, setProduct] = useState("");
  const [remediation, setRemediation] = useState("");
  const [cvssVersion, setCvssVersion] = useState("3.1");
  const [cvssScore, setCvssScore] = useState("");
  const [cvssVector, setCvssVector] = useState("");
  const [isRemote, setIsRemote] = useState(false);
  const [cwes, setCwes] = useState("");
  const [products, setProducts] = useState("");
  const [references, setReferences] = useState("");
  const [linkedCves, setLinkedCves] = useState("");
  const [linkedBdus, setLinkedBdus] = useState("");
  const [analysisStatus, setAnalysisStatus] = useState("open");
  const [discoverySource, setDiscoverySource] = useState("red-team");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canWrite =
    !!user &&
    (user.is_super_admin ||
      user.roles.some((r) => ["admin", "analyst", "ticket_manager"].includes(r)));

  if (loading) return <div className="text-sm text-muted">Загрузка…</div>;
  if (!canWrite) return <Card>Недостаточно прав для создания локальной записи.</Card>;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const score = cvssScore.trim() ? Number(cvssScore) : null;
      const res = await api<{ id: string }>("/local", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          severity,
          vendor,
          product_name: product,
          remediation,
          cvss_version: cvssVersion,
          cvss_score: Number.isFinite(score as number) ? score : null,
          cvss_severity: severity,
          cvss_vector: cvssVector,
          is_remote: isRemote,
          cwes: splitLines(cwes),
          products: splitLines(products),
          references: splitLines(references),
          linked_cve_ids: splitLines(linkedCves),
          linked_bdu_ids: splitLines(linkedBdus),
          analysis_status: analysisStatus,
          discovery_source: discoverySource,
          notes,
          status: analysisStatus || "open",
        }),
      });
      router.push(`/local/${encodeURIComponent(res.id)}`);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
      setBusy(false);
    }
  }

  const fieldClass =
    "w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Локальная уязвимость</h1>
        <p className="text-sm text-muted">
          Карточка red-team с полями уровня NVD. ID: PREFIX-YYYY-NNNN
        </p>
      </div>
      <Card>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Input label="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted">Описание</span>
            <textarea className={fieldClass} rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">Severity</span>
              <select className={fieldClass} value={severity} onChange={(e) => setSeverity(e.target.value)}>
                {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Статус анализа"
              value={analysisStatus}
              onChange={(e) => setAnalysisStatus(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Вендор" value={vendor} onChange={(e) => setVendor(e.target.value)} />
            <Input label="Продукт" value={product} onChange={(e) => setProduct(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="CVSS version" value={cvssVersion} onChange={(e) => setCvssVersion(e.target.value)} />
            <Input label="CVSS score" value={cvssScore} onChange={(e) => setCvssScore(e.target.value)} />
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={isRemote} onChange={(e) => setIsRemote(e.target.checked)} />
              Remote
            </label>
          </div>
          <Input label="CVSS vector" value={cvssVector} onChange={(e) => setCvssVector(e.target.value)} />
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted">CWE (через запятую / с новой строки)</span>
            <textarea className={fieldClass} rows={2} value={cwes} onChange={(e) => setCwes(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted">Products / CPE</span>
            <textarea className={fieldClass} rows={2} value={products} onChange={(e) => setProducts(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted">References (URL)</span>
            <textarea className={fieldClass} rows={2} value={references} onChange={(e) => setReferences(e.target.value)} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">Связанные CVE</span>
              <textarea className={fieldClass} rows={2} value={linkedCves} onChange={(e) => setLinkedCves(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">Связанные BDU</span>
              <textarea className={fieldClass} rows={2} value={linkedBdus} onChange={(e) => setLinkedBdus(e.target.value)} />
            </label>
          </div>
          <Input
            label="Источник обнаружения"
            value={discoverySource}
            onChange={(e) => setDiscoverySource(e.target.value)}
          />
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted">Рекомендации</span>
            <textarea className={fieldClass} rows={3} value={remediation} onChange={(e) => setRemediation(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted">Заметки</span>
            <textarea className={fieldClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {err ? <p className="text-sm text-danger">{err}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Создание…" : "Создать"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
