"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { BookOpen, Play } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { severityTone } from "@/lib/severity";

type Help = {
  fields: string[];
  operators: string[];
  examples: { title: string; query: string }[];
  notes: string;
};

type Hit = {
  id: string;
  severity: string;
  cvss_score?: number | null;
  published?: string | null;
  description: string;
  is_cisa_kev: boolean;
  has_bdu: boolean;
  epss_score?: number | null;
  href: string;
};

type ExecOut = {
  query: string;
  total: number;
  limit: number;
  offset: number;
  results: Hit[];
};

export default function CveqlPage() {
  const [help, setHelp] = useState<Help | null>(null);
  const [query, setQuery] = useState('severity = "CRITICAL"');
  const [data, setData] = useState<ExecOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Help>("/cveql/help")
      .then(setHelp)
      .catch((e) => setErr(e.message));
  }, []);

  const run = useCallback(
    async (q: string) => {
      setBusy(true);
      setErr(null);
      try {
        const res = await api<ExecOut>("/cveql/execute", {
          method: "POST",
          body: JSON.stringify({ query: q, limit: 50 }),
        });
        setData(res);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Ошибка");
        setData(null);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    run(query);
  }

  return (
    <div className="space-y-6" data-testid="cveql-page">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">CVEQL</h1>
        <p className="mt-1 text-sm text-muted">Threat-hunting запросы по CVE. AST → SQLAlchemy, без сырого SQL.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Card>
            <form onSubmit={onSubmit} className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1.5 block text-muted">Запрос</span>
                <textarea
                  className="min-h-[120px] w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 font-mono text-sm text-text outline-none focus:border-accent"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  spellCheck={false}
                  aria-label="CVEQL запрос"
                  data-testid="cveql-editor"
                />
              </label>
              <Button type="submit" disabled={busy}>
                <Play size={14} />
                {busy ? "Выполнение…" : "Выполнить"}
              </Button>
            </form>
          </Card>

          {err && (
            <Card className="border-danger/40 text-sm text-danger" role="alert" data-testid="cveql-error">
              {err}
            </Card>
          )}

          {data && (
            <Card data-testid="cveql-results">
              <div className="mb-3 flex items-center justify-between text-sm text-muted">
                <span>
                  Результатов: <span className="text-text">{data.total}</span>
                </span>
                <span className="font-mono text-xs">{data.query}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-muted">
                    <tr>
                      <th className="pb-2 font-medium">ID</th>
                      <th className="pb-2 font-medium">Severity</th>
                      <th className="pb-2 font-medium">CVSS</th>
                      <th className="pb-2 font-medium">EPSS</th>
                      <th className="pb-2 font-medium">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((r) => (
                      <tr key={r.id} className="border-t border-border align-top">
                        <td className="py-2">
                          <Link href={r.href} className="text-accent2 hover:underline">
                            {r.id}
                          </Link>
                          <div className="mt-0.5 max-w-xs text-xs text-muted line-clamp-2">{r.description}</div>
                        </td>
                        <td className="py-2">
                          {r.severity && <Badge tone={severityTone(r.severity)}>{r.severity}</Badge>}
                        </td>
                        <td className="py-2">{r.cvss_score ?? "—"}</td>
                        <td className="py-2">
                          {r.epss_score != null ? `${(r.epss_score * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {r.is_cisa_kev && <Badge tone="warn">KEV</Badge>}
                            {r.has_bdu && <Badge tone="accent">BDU</Badge>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.results.length && <p className="text-sm text-muted">Пустой результат.</p>}
              </div>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <BookOpen size={14} /> Примеры
            </h2>
            <ul className="space-y-2">
              {(help?.examples || []).map((ex) => (
                <li key={ex.title}>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-border px-3 py-2 text-left text-sm hover:border-accent/40"
                    onClick={() => {
                      setQuery(ex.query);
                      run(ex.query);
                    }}
                  >
                    <div className="font-medium">{ex.title}</div>
                    <code className="mt-1 block text-xs text-muted">{ex.query}</code>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-4 text-sm">
            <h2 className="mb-2 font-semibold">Поля</h2>
            <ul className="space-y-1 font-mono text-xs text-muted">
              {(help?.fields || []).map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <h2 className="mb-2 mt-4 font-semibold">Операторы</h2>
            <p className="font-mono text-xs text-muted">{(help?.operators || []).join(" ")}</p>
            {help?.notes && <p className="mt-3 text-xs text-muted">{help.notes}</p>}
          </Card>
        </aside>
      </div>
    </div>
  );
}
