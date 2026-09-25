"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Database,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  Upload,
} from "lucide-react";
import { api, getToken, hasPermission } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type SyncRun = {
  id: number;
  source: string;
  status: string;
  finished_at?: string | null;
  stats?: Record<string, unknown>;
  error?: string;
};

type DbSettings = {
  nvd_api_key_masked: string;
  nvd_api_key_configured: boolean;
  nvd_auto_update: boolean;
  nvd_auto_interval_hours: number;
  nvd_mock_mode: boolean;
  bdu_xml_url?: string;
  cve_store_raw_json?: boolean;
  last_nvd_sync: SyncRun | null;
  last_bdu_sync: SyncRun | null;
  last_kev_sync: SyncRun | null;
  stats: {
    db_version: string;
    cve_count: number;
    bdu_count: number;
    bdu_mapped: number;
    bdu_standalone: number;
    kev_count: number;
    nvd_mirror_status: string;
    cache_label: string;
    size_label: string;
    last_nvd_new: number;
    last_kev_matches: number;
  };
};

function fmtDate(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("ru-RU");
  } catch {
    return v;
  }
}

export default function DatabaseSettingsPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<DbSettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage =
    hasPermission(user, "vuln:sync") || hasPermission(user, "settings:write");

  const reload = useCallback(async () => {
    const res = await api<DbSettings>("/settings/database");
    setData(res);
  }, []);

  useEffect(() => {
    if (!canManage) return;
    reload().catch((e) => setErr(e.message));
  }, [canManage, reload]);

  if (loading) return <div className="text-sm text-muted">Загрузка…</div>;
  if (!canManage) {
    return <Card>Раздел «База данных» доступен администраторам.</Card>;
  }
  if (!data) return <div className="text-sm text-muted">Загрузка статуса БД…</div>;

  async function saveKey(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ message: string }>("/settings/database/nvd-key", {
        method: "PUT",
        body: JSON.stringify({ api_key: apiKey }),
      });
      setMsg(res.message);
      setApiKey("");
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function syncNvd() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await api<{ message: string }>("/settings/database/sync/nvd", { method: "POST" });
      setMsg(res.message);
      await reload();
      // Full NVD mirror can take 1–3h — poll progress from worker stats
      for (let i = 0; i < 900; i++) {
        await new Promise((r) => setTimeout(r, 10000));
        const snap = await api<DbSettings>("/settings/database");
        setData(snap);
        const st = snap.last_nvd_sync?.status;
        const stats = snap.last_nvd_sync?.stats || {};
        const pct = typeof stats.pct === "number" ? ` ${stats.pct}%` : "";
        const idx = stats.startIndex != null ? ` idx=${stats.startIndex}` : "";
        if (st === "success") {
          setMsg(`NVD sync готов: CVE в базе ${snap.stats.cve_count}${pct}`);
          break;
        }
        if (st === "failed") {
          setErr(snap.last_nvd_sync?.error || "NVD sync failed");
          break;
        }
        setMsg(`NVD sync: ${st || "pending"}… CVE ${snap.stats.cve_count}${pct}${idx}`);
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function syncKev() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await api<{ message: string }>("/settings/database/sync/kev", { method: "POST" });
      setMsg(res.message);
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const snap = await api<DbSettings>("/settings/database");
        setData(snap);
        if (snap.last_kev_sync?.status === "success" || snap.last_kev_sync?.status === "failed") break;
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function uploadBdu(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = getToken();
      const res = await fetch("/api/settings/database/bdu/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Ошибка загрузки");
      setMsg(body.message);
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAuto(enabled: boolean) {
    await api("/settings/database/nvd-auto-update", {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    });
    await reload();
  }

  async function toggleStoreRawJson(enabled: boolean) {
    await api("/settings/database/cve-store-raw-json", {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    });
    setMsg(enabled ? "Хранение raw_json включено" : "raw_json отключён для новых sync");
    await reload();
  }

  async function pruneRawJson() {
    if (!confirm("Обрезать крупные raw_json в БД? Операция необратима.")) return;
    setBusy(true);
    try {
      const res = await api<{ message: string }>("/settings/database/prune-raw-json", {
        method: "POST",
        body: JSON.stringify({ confirm: true, min_bytes: 10000, limit: 50000 }),
      });
      setMsg(res.message);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка prune");
    } finally {
      setBusy(false);
    }
  }

  async function exportDb() {
    const token = getToken();
    const res = await fetch("/api/settings/database/export/cves", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vbx-cves-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const s = data.stats;

  return (
    <div className="space-y-5" data-testid="settings-database">
      {/* NVD API Key */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <KeyRound size={18} className="text-accent2" />
          <h2 className="font-display text-lg font-semibold">API ключ NVD</h2>
          {data.nvd_mock_mode ? <Badge tone="warn">Mock mode</Badge> : <Badge tone="ok">API</Badge>}
        </div>
        <p className="mb-4 text-sm text-muted">
          Ключ необходим для синхронизации базы CVE и получения актуальных данных об уязвимостях.
        </p>
        <form className="flex flex-col gap-3 md:flex-row md:items-end" onSubmit={saveKey}>
          <div className="relative flex-1">
            <Input
              label="API Key NVD"
              type={showKey ? "text" : "password"}
              placeholder={data.nvd_api_key_masked || "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button
              type="button"
              className="absolute bottom-2.5 right-3 text-muted hover:text-text"
              onClick={() => setShowKey((v) => !v)}
              aria-label="Показать ключ"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <Button type="submit" disabled={busy || !apiKey}>
            Сохранить
          </Button>
        </form>
        <p className="mt-3 text-xs text-muted">
          Получить API ключ:{" "}
          <a
            className="text-accent2 hover:underline"
            href="https://nvd.nist.gov/developers/request-an-api-key"
            target="_blank"
            rel="noreferrer"
          >
            nvd.nist.gov/developers/request-an-api-key
          </a>
        </p>
      </Card>

      {/* NVD Sync */}
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <RefreshCw size={18} className="text-accent2" />
          <h2 className="font-display text-lg font-semibold">Синхронизация с NVD</h2>
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface2/60 p-4">
            <div className="text-xs uppercase tracking-wide text-muted">Последняя синхронизация</div>
            <div className="mt-2 text-lg font-medium">{fmtDate(data.last_nvd_sync?.finished_at)}</div>
            {data.last_nvd_sync?.status ? (
              <div className="mt-1 text-xs text-muted">статус: {data.last_nvd_sync.status}</div>
            ) : null}
          </div>
          <div className="rounded-xl border border-border bg-surface2/60 p-4">
            <div className="text-xs uppercase tracking-wide text-muted">Загружено CVE</div>
            <div className="mt-2 text-lg font-medium text-ok">
              {s.last_nvd_new ? `+${s.last_nvd_new}` : "—"}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface2/60 p-4">
            <div className="text-xs uppercase tracking-wide text-muted">Совпадения с KEV</div>
            <div className="mt-2 text-lg font-medium text-warn">
              {s.last_kev_matches ? `${s.last_kev_matches} совпад.` : "—"}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={syncNvd} disabled={busy}>
            <RefreshCw size={16} /> Запустить синхронизацию
          </Button>
          <Button type="button" variant="secondary" onClick={syncKev} disabled={busy}>
            Обновить CISA KEV
          </Button>
          <label className="inline-flex cursor-pointer">
            <span className="sr-only">Импорт из файла</span>
            <Button type="button" variant="secondary" disabled>
              <Upload size={16} /> Импорт из файла
            </Button>
          </label>
          <Button type="button" variant="secondary" onClick={exportDb} disabled={busy}>
            <Download size={16} /> Экспорт базы
          </Button>
        </div>
      </Card>

      {/* DB state */}
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Database size={18} className="text-accent2" />
          <h2 className="font-display text-lg font-semibold">Состояние базы данных</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Версия базы", s.db_version],
            ["Записей CVE", s.cve_count.toLocaleString("ru-RU")],
            ["Размер", s.size_label],
            ["Зеркало NVD", s.nvd_mirror_status],
            ["CISA KEV", `${s.kev_count.toLocaleString("ru-RU")} записей`],
            ["Кэш", s.cache_label],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border bg-bg/40 p-4">
              <div className="text-xs text-muted">{label}</div>
              <div className="mt-1 text-lg font-medium">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between rounded-xl border border-border bg-surface2/50 px-4 py-3">
          <div>
            <div className="font-medium">Автообновление NVD</div>
            <div className="text-sm text-muted">Каждые {data.nvd_auto_interval_hours} часа</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={data.nvd_auto_update}
            onClick={() => toggleAuto(!data.nvd_auto_update)}
            className={`relative h-7 w-12 rounded-full transition ${
              data.nvd_auto_update ? "bg-accent" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition ${
                data.nvd_auto_update ? "left-5" : "left-0.5"
              }`}
            />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div>
            <div className="font-medium">Хранить NVD raw_json</div>
            <div className="text-sm text-muted">
              Env <code className="text-xs">VBX_CVE_STORE_RAW_JSON</code> / настройка. Off → stub при sync.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!data.cve_store_raw_json}
            onClick={() => toggleStoreRawJson(!data.cve_store_raw_json)}
            className={`relative h-7 w-12 rounded-full transition ${
              data.cve_store_raw_json ? "bg-accent" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition ${
                data.cve_store_raw_json ? "left-5" : "left-0.5"
              }`}
            />
          </button>
        </div>
        <div className="mt-3">
          <Button type="button" variant="secondary" disabled={busy} onClick={pruneRawJson}>
            Prune крупные raw_json
          </Button>
        </div>
      </Card>

      {/* BDU */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Upload size={18} className="text-accent2" />
          <h2 className="font-display text-lg font-semibold">База БДУ (ФСТЭК)</h2>
        </div>
        <p className="mb-4 text-sm text-muted">
          Актуальная выгрузка ФСТЭК — <code className="text-xs">vullist.xlsx</code> (старый{" "}
          <code className="text-xs">vulxml.xml</code> больше не отдаётся, 404). Записи с CVE — в секцию
          карточки; без CVE — отдельные карточки BDU.
        </p>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface2/60 p-4">
            <div className="text-xs text-muted">Последний импорт</div>
            <div className="mt-2 font-medium">{fmtDate(data.last_bdu_sync?.finished_at)}</div>
            {data.last_bdu_sync?.status ? (
              <div className="mt-1 text-xs text-muted">статус: {data.last_bdu_sync.status}</div>
            ) : null}
          </div>
          <div className="rounded-xl border border-border bg-surface2/60 p-4">
            <div className="text-xs text-muted">Привязано к CVE</div>
            <div className="mt-2 font-medium text-accent2">{s.bdu_mapped}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface2/60 p-4">
            <div className="text-xs text-muted">Standalone BDU</div>
            <div className="mt-2 font-medium">{s.bdu_standalone}</div>
          </div>
        </div>
        <form
          className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMsg(null);
            setErr(null);
            try {
              const res = await api<{ message: string }>("/settings/database/bdu-url", {
                method: "PUT",
                body: JSON.stringify({ bdu_xml_url: data.bdu_xml_url || "" }),
              });
              setMsg(res.message);
              await reload();
            } catch (ex) {
              setErr(ex instanceof Error ? ex.message : "Ошибка");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="min-w-0 flex-1">
            <Input
              label="URL XML-выгрузки БДУ"
              value={data.bdu_xml_url || ""}
              onChange={(e) => setData({ ...data, bdu_xml_url: e.target.value })}
              placeholder="https://bdu.fstec.ru/files/documents/vullist.xlsx"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={busy}>
            Сохранить URL
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg(null);
              setErr(null);
              try {
                const res = await api<{ message: string }>("/settings/database/sync/bdu-url", {
                  method: "POST",
                  body: "{}",
                });
                setMsg(res.message);
                await reload();
                for (let i = 0; i < 60; i++) {
                  await new Promise((r) => setTimeout(r, 5000));
                  const snap = await api<DbSettings>("/settings/database");
                  setData(snap);
                  const st = snap.last_bdu_sync?.status;
                  if (st === "success") {
                    setMsg(
                      `БДУ готов: всего ${snap.stats.bdu_count}, mapped ${snap.stats.bdu_mapped}, standalone ${snap.stats.bdu_standalone}`,
                    );
                    break;
                  }
                  if (st === "failed") {
                    setErr(snap.last_bdu_sync?.error || "BDU sync failed");
                    break;
                  }
                  setMsg(`БДУ: ${st || "pending"}… записей ${snap.stats.bdu_count}`);
                }
              } catch (ex) {
                setErr(ex instanceof Error ? ex.message : "Ошибка sync БДУ");
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw size={16} /> Sync по URL
          </Button>
        </form>
        <label className="inline-flex cursor-pointer items-center">
          <input
            type="file"
            accept=".xml,.xlsx,text/xml,application/xml,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadBdu(f);
              e.target.value = "";
            }}
          />
          <span className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent2">
            <Upload size={16} /> Загрузить БДУ (XML/XLSX)
          </span>
        </label>
        {data.last_bdu_sync?.error ? (
          <p className="mt-3 text-sm text-danger">{data.last_bdu_sync.error}</p>
        ) : null}
      </Card>

      {busy ? <p className="text-sm text-accent2">Выполняется операция… не закрывайте вкладку.</p> : null}
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}
      {err ? <p className="text-sm text-danger">{err}</p> : null}
      {data.last_nvd_sync?.status === "failed" && data.last_nvd_sync.error ? (
        <p className="text-sm text-danger">NVD: {data.last_nvd_sync.error}</p>
      ) : null}
    </div>
  );
}
