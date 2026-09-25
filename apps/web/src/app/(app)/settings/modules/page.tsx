"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { api, hasPermission } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatDate } from "@/lib/severity";

type ModuleRow = {
  id: string;
  name?: string | null;
  version?: string | null;
  online?: boolean;
  enabled?: boolean;
  status?: string | null;
  capabilities?: string[] | Record<string, unknown> | null;
  last_seen_at?: string | null;
  description?: string | null;
};

type ModuleSettings = {
  disabled_modules: string[];
  allowlist: string;
  shodan_api_key_set: boolean;
  shodan_api_key_masked: string;
  shodan_mock: boolean;
  shodan_modes_enabled: string[];
  shodan_rate_limit_hint: number;
  module_tokens_set?: Record<string, boolean>;
  nmap_default_ports: string;
  nmap_default_profile: string;
  nmap_default_timing: number;
  nmap_default_sv: boolean;
  nmap_default_os: boolean;
  nmap_default_aggressive: boolean;
  nmap_default_scripts: string;
  nmap_default_top_ports: string;
  nmap_default_exclude: string;
  zap_timeout_sec: number;
  zap_default_scan_type: string;
  zap_default_ajax_spider: boolean;
  zap_default_context_name: string;
  zap_default_context_user: string;
  zap_default_credential_id: number | null;
  nuclei_default_templates: string;
  nuclei_rate_limit: number;
  gowitness_timeout_sec: number;
  gowitness_default_resolution: string;
  gowitness_default_fullpage: boolean;
};

type ScanCredential = {
  id: number;
  name: string;
  kind: string;
  username: string;
  password_set: boolean;
  password_masked: string;
  extra: Record<string, unknown>;
  created_at?: string | null;
  updated_at?: string | null;
};

const KNOWN_MODULES = ["nmap", "shodan", "zap", "nuclei", "gowitness"];
const NMAP_PROFILES = [
  { value: "quick", label: "Быстрый" },
  { value: "default", label: "Обычный" },
  { value: "full", label: "Полный" },
  { value: "udp", label: "UDP" },
  { value: "vuln-scripts", label: "NSE vuln" },
];
const SHODAN_MODES = ["host", "search", "dns"];
const ZAP_SCAN_TYPES = [
  { value: "baseline", label: "Baseline" },
  { value: "spider", label: "Spider" },
  { value: "full", label: "Full" },
  { value: "api", label: "API" },
];
const CREDENTIAL_KINDS = ["http_form", "http_basic", "zap_context"];

const CAPABILITY_LABELS: Record<string, string> = {
  port_scan: "Порты",
  os_detect: "ОС",
  nse: "NSE",
  "finding.v1": "findings",
  "enrichment.shodan": "Shodan",
  "shodan.host": "host",
  "shodan.search": "search",
  "shodan.dns": "dns",
  "web.baseline": "baseline",
  "web.spider": "spider",
  "web.active": "active",
  "web.api": "api",
  "vuln.template": "Шаблоны",
  "web.screenshot": "Скриншот",
  "web.recon": "Recon",
};

function capabilityLabels(caps: ModuleRow["capabilities"]): string[] {
  if (!caps) return [];
  const raw = Array.isArray(caps) ? caps.map(String) : Object.keys(caps);
  return raw.filter((c) => !c.startsWith("meta:"));
}

function capabilityLabel(cap: string): string {
  return CAPABILITY_LABELS[cap] || cap;
}

function hasMetaCapability(caps: ModuleRow["capabilities"], key: string): boolean {
  if (!caps) return false;
  const raw = Array.isArray(caps) ? caps.map(String) : Object.keys(caps);
  return raw.includes(`meta:${key}`) || raw.includes(key);
}

function asModuleList(data: unknown): ModuleRow[] {
  if (Array.isArray(data)) return data as ModuleRow[];
  if (data && typeof data === "object") {
    const o = data as { results?: ModuleRow[]; modules?: ModuleRow[] };
    if (Array.isArray(o.results)) return o.results;
    if (Array.isArray(o.modules)) return o.modules;
  }
  return [];
}

function isOnline(m: ModuleRow): boolean {
  if (typeof m.online === "boolean") return m.online;
  const s = (m.status || "").toLowerCase();
  return s === "online" || s === "ready" || s === "active";
}

export default function SettingsModulesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ModuleRow[]>([]);
  const [settings, setSettings] = useState<ModuleSettings | null>(null);
  const [allowlist, setAllowlist] = useState("");
  const [nmapPorts, setNmapPorts] = useState("");
  const [nmapProfile, setNmapProfile] = useState("default");
  const [nmapTiming, setNmapTiming] = useState(3);
  const [nmapSv, setNmapSv] = useState(false);
  const [nmapOs, setNmapOs] = useState(false);
  const [nmapAggressive, setNmapAggressive] = useState(false);
  const [nmapScripts, setNmapScripts] = useState("");
  const [nmapTopPorts, setNmapTopPorts] = useState("");
  const [nmapExclude, setNmapExclude] = useState("");
  const [zapTimeout, setZapTimeout] = useState(300);
  const [zapScanType, setZapScanType] = useState("baseline");
  const [zapAjax, setZapAjax] = useState(false);
  const [zapContext, setZapContext] = useState("");
  const [zapContextUser, setZapContextUser] = useState("");
  const [zapCredentialId, setZapCredentialId] = useState<number | "">("");
  const [nucleiTemplates, setNucleiTemplates] = useState("");
  const [nucleiRateLimit, setNucleiRateLimit] = useState(150);
  const [nucleiSyncStatus, setNucleiSyncStatus] = useState<{
    last_sync_at?: string | null;
    last_sync_status?: string;
    last_sync_error?: string;
    template_count?: number;
    official_count?: number;
    custom_count?: number;
    official_path?: string;
    custom_path?: string;
    auto_sync?: boolean;
    sync_running?: boolean;
    git_available?: boolean;
  } | null>(null);
  const [nucleiSyncBusy, setNucleiSyncBusy] = useState(false);
  const [gwTimeout, setGwTimeout] = useState(60);
  const [gwResolution, setGwResolution] = useState("1440x900");
  const [gwFullpage, setGwFullpage] = useState(false);
  const [credentials, setCredentials] = useState<ScanCredential[]>([]);
  const [credName, setCredName] = useState("");
  const [credKind, setCredKind] = useState("http_form");
  const [credUsername, setCredUsername] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credLoginUrl, setCredLoginUrl] = useState("");
  const [credUserField, setCredUserField] = useState("username");
  const [credPassField, setCredPassField] = useState("password");
  const [credBusy, setCredBusy] = useState(false);
  const [shodanMock, setShodanMock] = useState(true);
  const [shodanKey, setShodanKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [moduleTokenInputs, setModuleTokenInputs] = useState<Record<string, string>>({});
  const [clearModuleTokens, setClearModuleTokens] = useState<Record<string, boolean>>({});
  const [moduleTokensSet, setModuleTokensSet] = useState<Record<string, boolean>>({});
  const [shodanModes, setShodanModes] = useState<Record<string, boolean>>({
    host: true,
    search: true,
    dns: true,
  });
  const [shodanRate, setShodanRate] = useState(1);
  const [disabled, setDisabled] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canRead = hasPermission(user, "scan:read");
  const canAdmin =
    hasPermission(user, "scan:admin") ||
    !!user?.is_super_admin ||
    !!user?.roles.includes("admin");

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const data = await api<unknown>("/modules");
      const list = asModuleList(data);
      setRows(list);
      if (canAdmin) {
        const s = await api<ModuleSettings>("/settings/modules");
        setSettings(s);
        setAllowlist(s.allowlist || "");
        setNmapPorts(s.nmap_default_ports || "");
        setNmapProfile(s.nmap_default_profile || "default");
        setNmapTiming(s.nmap_default_timing ?? 3);
        setNmapSv(!!s.nmap_default_sv);
        setNmapOs(!!s.nmap_default_os);
        setNmapAggressive(!!s.nmap_default_aggressive);
        setNmapScripts(s.nmap_default_scripts || "");
        setNmapTopPorts(s.nmap_default_top_ports || "");
        setNmapExclude(s.nmap_default_exclude || "");
        setZapTimeout(s.zap_timeout_sec || 300);
        setZapScanType(s.zap_default_scan_type || "baseline");
        setZapAjax(!!s.zap_default_ajax_spider);
        setZapContext(s.zap_default_context_name || "");
        setZapContextUser(s.zap_default_context_user || "");
        setZapCredentialId(s.zap_default_credential_id ?? "");
        setNucleiTemplates(s.nuclei_default_templates || "");
        setNucleiRateLimit(s.nuclei_rate_limit ?? 150);
        try {
          const st = await api<{
            last_sync_at?: string | null;
            last_sync_status?: string;
            last_sync_error?: string;
            template_count?: number;
            official_count?: number;
            custom_count?: number;
            official_path?: string;
            custom_path?: string;
            auto_sync?: boolean;
            sync_running?: boolean;
            git_available?: boolean;
          }>("/modules/nuclei/templates/status");
          setNucleiSyncStatus(st);
        } catch {
          setNucleiSyncStatus(null);
        }
        setGwTimeout(s.gowitness_timeout_sec ?? 60);
        setGwResolution(s.gowitness_default_resolution || "1440x900");
        setGwFullpage(!!s.gowitness_default_fullpage);
        const creds = await api<{ credentials?: ScanCredential[] } | ScanCredential[]>(
          "/settings/scan-credentials",
        );
        setCredentials(
          Array.isArray(creds)
            ? creds
            : Array.isArray(creds?.credentials)
              ? creds.credentials
              : [],
        );
        setShodanMock(!!s.shodan_mock);
        setShodanRate(s.shodan_rate_limit_hint || 1);
        const modes: Record<string, boolean> = { host: false, search: false, dns: false };
        for (const m of s.shodan_modes_enabled || SHODAN_MODES) modes[m] = true;
        setShodanModes(modes);
        setShodanKey("");
        setClearKey(false);
        setModuleTokensSet(s.module_tokens_set || {});
        setModuleTokenInputs({});
        setClearModuleTokens({});
        const off: Record<string, boolean> = {};
        for (const id of KNOWN_MODULES) off[id] = false;
        for (const m of list) off[m.id] = m.enabled === false;
        for (const id of s.disabled_modules || []) off[id] = true;
        setDisabled(off);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canAdmin]);

  useEffect(() => {
    if (!canRead && !canAdmin) {
      setLoading(false);
      return;
    }
    load();
  }, [canRead, canAdmin, load]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!canAdmin) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const disabled_modules = Object.entries(disabled)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const shodan_modes_enabled = Object.entries(shodanModes)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const body: Record<string, unknown> = {
        disabled_modules,
        allowlist,
        shodan_mock: shodanMock,
        shodan_modes_enabled,
        shodan_rate_limit_hint: shodanRate,
        nmap_default_ports: nmapPorts,
        nmap_default_profile: nmapProfile,
        nmap_default_timing: nmapTiming,
        nmap_default_sv: nmapSv,
        nmap_default_os: nmapOs,
        nmap_default_aggressive: nmapAggressive,
        nmap_default_scripts: nmapScripts,
        nmap_default_top_ports: nmapTopPorts,
        nmap_default_exclude: nmapExclude,
        zap_timeout_sec: zapTimeout,
        zap_default_scan_type: zapScanType,
        zap_default_ajax_spider: zapAjax,
        zap_default_context_name: zapContext,
        zap_default_context_user: zapContextUser,
        nuclei_default_templates: nucleiTemplates,
        nuclei_rate_limit: nucleiRateLimit,
        gowitness_timeout_sec: gwTimeout,
        gowitness_default_resolution: gwResolution,
        gowitness_default_fullpage: gwFullpage,
        clear_shodan_api_key: clearKey,
      };
      if (zapCredentialId === "" || zapCredentialId == null) {
        body.clear_zap_default_credential = true;
      } else {
        body.zap_default_credential_id = Number(zapCredentialId);
      }
      if (shodanKey.trim()) body.shodan_api_key = shodanKey.trim();
      const tokens: Record<string, string> = {};
      for (const [mid, tok] of Object.entries(moduleTokenInputs)) {
        if (tok.trim()) tokens[mid] = tok.trim();
      }
      if (Object.keys(tokens).length) body.module_tokens = tokens;
      const clearToks = Object.entries(clearModuleTokens)
        .filter(([, v]) => v)
        .map(([k]) => k);
      if (clearToks.length) body.clear_module_tokens = clearToks;
      const s = await api<ModuleSettings>("/settings/modules", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setSettings(s);
      setZapCredentialId(s.zap_default_credential_id ?? "");
      setShodanKey("");
      setClearKey(false);
      setModuleTokenInputs({});
      setClearModuleTokens({});
      setModuleTokensSet(s.module_tokens_set || {});
      setMsg(
        "Настройки модулей сохранены. Sidecar подхватят allowlist при следующем poll; ключ Shodan — через env или POST /internal/modules/shodan/api-key.",
      );
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function onCreateCredential(e?: FormEvent) {
    e?.preventDefault();
    if (!canAdmin || !credName.trim()) return;
    setCredBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const extra: Record<string, string> = {};
      if (credKind === "http_form" || credKind === "http_basic") {
        if (credLoginUrl.trim()) extra.login_url = credLoginUrl.trim();
        if (credUserField.trim()) extra.username_field = credUserField.trim();
        if (credPassField.trim()) extra.password_field = credPassField.trim();
      }
      if (credKind === "zap_context") {
        if (zapContext.trim()) extra.context_name = zapContext.trim();
        if (zapContextUser.trim()) extra.context_user = zapContextUser.trim();
      }
      await api<ScanCredential>("/settings/scan-credentials", {
        method: "POST",
        body: JSON.stringify({
          name: credName.trim(),
          kind: credKind,
          username: credUsername,
          password: credPassword,
          extra,
        }),
      });
      setCredName("");
      setCredUsername("");
      setCredPassword("");
      setCredLoginUrl("");
      setMsg("Учётные данные добавлены в vault (пароль зашифрован).");
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка создания credential");
    } finally {
      setCredBusy(false);
    }
  }

  async function onDeleteCredential(id: number) {
    if (!canAdmin) return;
    setCredBusy(true);
    setErr(null);
    try {
      await api(`/settings/scan-credentials/${id}`, { method: "DELETE" });
      if (zapCredentialId === id) setZapCredentialId("");
      setMsg("Credential удалён.");
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка удаления");
    } finally {
      setCredBusy(false);
    }
  }
  if (!canRead && !canAdmin) {
    return (
      <Card data-testid="settings-modules-denied">
        Просмотр модулей сканирования доступен при наличии права scan:read.
      </Card>
    );
  }

  const moduleIds = Array.from(
    new Set([...KNOWN_MODULES, ...rows.map((r) => r.id), ...Object.keys(disabled)]),
  ).sort();

  return (
    <div className="space-y-4" data-testid="settings-modules">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Модули сканирования</h2>
          <p className="mt-1 text-sm text-muted">
            Sidecar-сканеры с профилями nmap, режимами Shodan, типами ZAP, nuclei и gowitness.
            Цели вне allowlist отклоняются.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw size={14} />
          Обновить
        </Button>
      </div>

      {err && (
        <Card className="border-danger/40 text-sm text-danger" role="alert">
          {err}
        </Card>
      )}
      {msg && (
        <Card className="text-sm text-ok" role="status">
          {msg}
        </Card>
      )}

      <Card className="border-accent/20 bg-accent/5 text-sm text-muted">
        <div className="font-medium text-text">Установка через Compose profiles</div>
        <p className="mt-1">
          Сканеры не входят в базовый{" "}
          <code className="rounded bg-surface2 px-1.5 py-0.5 font-mono text-xs">docker compose up</code>.
          Подключайте профиль нужного модуля, например:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-surface2 p-3 font-mono text-xs text-text">
          {`docker compose -f docker-compose.yml -f docker-compose.scanners.yml \\
  --profile nmap --profile shodan --profile zap --profile nuclei --profile gowitness up -d`}
        </pre>
      </Card>

      {canAdmin && (
        <Card data-testid="settings-modules-admin">
          <form onSubmit={onSave} className="space-y-4">
            <div>
              <div className="font-medium text-text">Администрирование</div>
              <p className="mt-1 text-sm text-muted">
                Allowlist и defaults отдаются sidecar через{" "}
                <code className="rounded bg-surface2 px-1 font-mono text-xs">
                  /internal/modules/config
                </code>{" "}
                (без plaintext Shodan key). Ключ Shodan — через env/docker secret или
                POST /internal/modules/shodan/api-key. Опциональные per-module токены
                (иначе общий VBX_MODULE_TOKEN).
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-sm text-muted">Включение модулей</div>
              <div className="flex flex-wrap gap-3">
                {moduleIds.map((id) => (
                  <label key={id} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!disabled[id]}
                      onChange={(e) =>
                        setDisabled((prev) => ({ ...prev, [id]: !e.target.checked }))
                      }
                    />
                    <span className="font-mono">{id}</span>
                    <span className="text-muted">{disabled[id] ? "выкл" : "вкл"}</span>
                  </label>
                ))}
              </div>
            </div>

            <Input
              label="Allowlist целей (через запятую: host, IP, CIDR, URL)"
              value={allowlist}
              onChange={(e) => setAllowlist(e.target.value)}
              placeholder="127.0.0.1, scan-target, 10.0.0.0/8"
              data-testid="modules-allowlist"
            />

            <div className="space-y-3 rounded-xl border border-border p-3">
              <div className="text-sm font-medium text-text">Per-module tokens (опционально)</div>
              <p className="text-xs text-muted">
                Если задан — worker может аутентифицироваться своим токеном вместо общего
                VBX_MODULE_TOKEN. Пустое поле = не менять. Также: VBX_MODULE_TOKEN_NMAP и т.п.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {KNOWN_MODULES.map((id) => (
                  <div key={id} className="space-y-1.5">
                    <Input
                      label={
                        moduleTokensSet[id]
                          ? `${id} token (задан)`
                          : `${id} token`
                      }
                      type="password"
                      autoComplete="new-password"
                      value={moduleTokenInputs[id] || ""}
                      onChange={(e) =>
                        setModuleTokenInputs((prev) => ({ ...prev, [id]: e.target.value }))
                      }
                      placeholder="••••••••"
                      data-testid={`modules-token-${id}`}
                    />
                    <label className="inline-flex items-center gap-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={!!clearModuleTokens[id]}
                        onChange={(e) =>
                          setClearModuleTokens((prev) => ({ ...prev, [id]: e.target.checked }))
                        }
                      />
                      Сбросить
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border p-3">
              <div className="text-sm font-medium text-text">Nmap — defaults</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-sm text-muted">Профиль по умолчанию</span>
                  <select
                    className="vbx-field w-full"
                    value={nmapProfile}
                    onChange={(e) => setNmapProfile(e.target.value)}
                  >
                    {NMAP_PROFILES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Timing (-T0..5)"
                  type="number"
                  min={0}
                  max={5}
                  value={nmapTiming}
                  onChange={(e) => setNmapTiming(Number(e.target.value) || 0)}
                />
                <Input
                  label="Порты по умолчанию"
                  value={nmapPorts}
                  onChange={(e) => setNmapPorts(e.target.value)}
                  placeholder="22,80,443,8000,3000"
                />
                <Input
                  label="Top-ports (если порты пусты)"
                  value={nmapTopPorts}
                  onChange={(e) => setNmapTopPorts(e.target.value)}
                  placeholder="100"
                />
                <Input
                  label="NSE scripts"
                  value={nmapScripts}
                  onChange={(e) => setNmapScripts(e.target.value)}
                  placeholder="vuln,safe"
                />
                <Input
                  label="Exclude"
                  value={nmapExclude}
                  onChange={(e) => setNmapExclude(e.target.value)}
                  placeholder="10.0.0.1"
                />
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={nmapSv} onChange={(e) => setNmapSv(e.target.checked)} />
                  -sV (service detection)
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={nmapOs} onChange={(e) => setNmapOs(e.target.checked)} />
                  -O (OS detection)
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={nmapAggressive}
                    onChange={(e) => setNmapAggressive(e.target.checked)}
                  />
                  -A (aggressive)
                </label>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border p-3">
              <div className="text-sm font-medium text-text">ZAP — defaults</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-sm text-muted">Тип скана</span>
                  <select
                    className="vbx-field w-full"
                    value={zapScanType}
                    onChange={(e) => setZapScanType(e.target.value)}
                  >
                    {ZAP_SCAN_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Timeout / max duration (сек)"
                  type="number"
                  min={30}
                  max={7200}
                  value={zapTimeout}
                  onChange={(e) => setZapTimeout(Number(e.target.value) || 300)}
                />
                <Input
                  label="Context name (auth)"
                  value={zapContext}
                  onChange={(e) => setZapContext(e.target.value)}
                  placeholder="optional"
                />
                <Input
                  label="Context user"
                  value={zapContextUser}
                  onChange={(e) => setZapContextUser(e.target.value)}
                  placeholder="optional"
                />
                <label className="block space-y-1.5 sm:col-span-2">
                  <span className="text-sm text-muted">Default credential (vault)</span>
                  <select
                    className="vbx-field w-full"
                    value={zapCredentialId === "" ? "" : String(zapCredentialId)}
                    onChange={(e) =>
                      setZapCredentialId(e.target.value ? Number(e.target.value) : "")
                    }
                    data-testid="modules-zap-credential"
                  >
                    <option value="">— нет —</option>
                    {credentials.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.id} {c.name} ({c.kind})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={zapAjax} onChange={(e) => setZapAjax(e.target.checked)} />
                Ajax spider по умолчанию
              </label>
              <p className="text-xs text-muted">
                Form-based auth требует ZAP daemon API (`VBX_ZAP_API_URL`). Baseline-скрипты без
                API работают без логина — worker передаёт только env-hints.
              </p>
            </div>

            <div className="space-y-3 rounded-xl border border-border p-3">
              <div className="text-sm font-medium text-text">Nuclei — defaults</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Шаблоны по умолчанию (путь или теги)"
                  value={nucleiTemplates}
                  onChange={(e) => setNucleiTemplates(e.target.value)}
                  placeholder="/app/artifacts/nuclei-templates"
                />
                <Input
                  label="Rate limit (запр./с)"
                  type="number"
                  min={1}
                  max={10000}
                  value={nucleiRateLimit}
                  onChange={(e) => setNucleiRateLimit(Number(e.target.value) || 150)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={nucleiSyncBusy}
                  data-testid="nuclei-templates-sync-btn"
                  onClick={async () => {
                    setNucleiSyncBusy(true);
                    setErr(null);
                    setMsg(null);
                    try {
                      await api("/settings/modules/nuclei/templates/sync", { method: "POST" });
                      setMsg("Синхронизация шаблонов nuclei запущена");
                      for (let i = 0; i < 6; i++) {
                        await new Promise((r) => setTimeout(r, 1500));
                        const st = await api<{
                          last_sync_at?: string | null;
                          last_sync_status?: string;
                          last_sync_error?: string;
                          template_count?: number;
                          official_count?: number;
                          custom_count?: number;
                          official_path?: string;
                          custom_path?: string;
                          auto_sync?: boolean;
                          sync_running?: boolean;
                          git_available?: boolean;
                        }>("/modules/nuclei/templates/status");
                        setNucleiSyncStatus(st);
                        if (st.last_sync_status && st.last_sync_status !== "running") break;
                      }
                    } catch (ex) {
                      setErr(ex instanceof Error ? ex.message : "Ошибка синхронизации");
                    } finally {
                      setNucleiSyncBusy(false);
                    }
                  }}
                >
                  <RefreshCw className={`h-4 w-4 ${nucleiSyncBusy ? "animate-spin" : ""}`} />
                  Синхронизировать шаблоны
                </Button>
                <div className="text-xs text-muted" data-testid="nuclei-templates-sync">
                  статус:{" "}
                  <span className="font-mono text-text">
                    {nucleiSyncStatus?.sync_running
                      ? "running"
                      : nucleiSyncStatus?.last_sync_status || "never"}
                  </span>
                  {nucleiSyncStatus?.last_sync_at
                    ? ` · ${formatDate(nucleiSyncStatus.last_sync_at)}`
                    : ""}
                  {" · "}
                  {nucleiSyncStatus?.template_count ?? 0} шаблонов
                  {typeof nucleiSyncStatus?.custom_count === "number"
                    ? ` (${nucleiSyncStatus.custom_count} custom)`
                    : ""}
                  {nucleiSyncStatus?.git_available === false ? " · git недоступен" : ""}
                  {nucleiSyncStatus?.last_sync_error ? (
                    <span className="mt-1 block text-danger">{nucleiSyncStatus.last_sync_error}</span>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-muted">
                Каталог:{" "}
                <code className="rounded bg-surface2 px-1 font-mono">
                  {nucleiSyncStatus?.official_path || "/app/artifacts/nuclei-templates"}
                </code>
                , custom:{" "}
                <code className="rounded bg-surface2 px-1 font-mono">
                  {nucleiSyncStatus?.custom_path || "/app/artifacts/nuclei-custom"}
                </code>
                . Auto-sync:{" "}
                <code className="rounded bg-surface2 px-1 font-mono">NUCLEI_TEMPLATES_AUTO_SYNC</code>
                . Volume:{" "}
                <code className="rounded bg-surface2 px-1 font-mono">nuclei_templates</code>.
              </p>
            </div>

            <div className="space-y-3 rounded-xl border border-border p-3">
              <div className="text-sm font-medium text-text">gowitness — defaults</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Таймаут (сек)"
                  type="number"
                  min={10}
                  max={600}
                  value={gwTimeout}
                  onChange={(e) => setGwTimeout(Number(e.target.value) || 60)}
                />
                <Input
                  label="Разрешение (Ш×В)"
                  value={gwResolution}
                  onChange={(e) => setGwResolution(e.target.value)}
                  placeholder="1440x900"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={gwFullpage}
                  onChange={(e) => setGwFullpage(e.target.checked)}
                />
                Полная страница по умолчанию
              </label>
              <p className="text-xs text-muted">
                Скриншоты → volume{" "}
                <code className="rounded bg-surface2 px-1 font-mono">gowitness_data</code> (
                worker <code className="rounded bg-surface2 px-1 font-mono">/data</code>, API{" "}
                <code className="rounded bg-surface2 px-1 font-mono">/app/artifacts/gowitness</code>
                ). Ingest → <code className="rounded bg-surface2 px-1 font-mono">artifact_key</code>;
                UI: Находки. Profile:{" "}
                <code className="rounded bg-surface2 px-1 font-mono">gowitness</code>.
              </p>
            </div>

            <div className="space-y-3 rounded-xl border border-border p-3" data-testid="settings-scan-credentials">
              <div className="text-sm font-medium text-text">Credential vault</div>
              <p className="text-xs text-muted">
                Пароли шифруются at rest (`encrypt_secret`). Admin API возвращает только маску
                `********`. Workers получают plaintext один раз через{" "}
                <code className="rounded bg-surface2 px-1 font-mono">
                  GET /internal/modules/credentials/&#123;id&#125;
                </code>
                .
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Имя"
                  value={credName}
                  onChange={(e) => setCredName(e.target.value)}
                  data-testid="cred-name"
                />
                <label className="block space-y-1.5">
                  <span className="text-sm text-muted">Kind</span>
                  <select
                    className="vbx-field w-full"
                    value={credKind}
                    onChange={(e) => setCredKind(e.target.value)}
                  >
                    {CREDENTIAL_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Username"
                  value={credUsername}
                  onChange={(e) => setCredUsername(e.target.value)}
                  autoComplete="off"
                />
                <Input
                  label="Password"
                  type="password"
                  value={credPassword}
                  onChange={(e) => setCredPassword(e.target.value)}
                  autoComplete="new-password"
                />
                {(credKind === "http_form" || credKind === "http_basic") && (
                  <>
                    <Input
                      label="Login URL"
                      value={credLoginUrl}
                      onChange={(e) => setCredLoginUrl(e.target.value)}
                      placeholder="https://app/login"
                    />
                    <Input
                      label="Username field"
                      value={credUserField}
                      onChange={(e) => setCredUserField(e.target.value)}
                    />
                    <Input
                      label="Password field"
                      value={credPassField}
                      onChange={(e) => setCredPassField(e.target.value)}
                    />
                  </>
                )}
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={credBusy || !credName.trim()}
                    onClick={() => void onCreateCredential()}
                  >
                    <Plus size={14} />
                    {credBusy ? "…" : "Добавить credential"}
                  </Button>
                </div>
              </div>
              {credentials.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border text-muted">
                      <tr>
                        <th className="py-2 pr-3">ID</th>
                        <th className="py-2 pr-3">Name</th>
                        <th className="py-2 pr-3">Kind</th>
                        <th className="py-2 pr-3">User</th>
                        <th className="py-2 pr-3">Password</th>
                        <th className="py-2 pr-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {credentials.map((c) => (
                        <tr key={c.id} className="border-b border-border/60">
                          <td className="py-2 pr-3 font-mono text-xs">{c.id}</td>
                          <td className="py-2 pr-3">{c.name}</td>
                          <td className="py-2 pr-3 font-mono text-xs">{c.kind}</td>
                          <td className="py-2 pr-3">{c.username || "—"}</td>
                          <td className="py-2 pr-3 font-mono text-xs">
                            {c.password_set ? c.password_masked || "********" : "—"}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => onDeleteCredential(c.id)}
                              disabled={credBusy}
                              aria-label={`Delete credential ${c.id}`}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted">Vault пуст.</p>
              )}
            </div>

            <div className="space-y-2 rounded-xl border border-border p-3">
              <div className="text-sm font-medium text-text">Shodan</div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={shodanMock}
                  onChange={(e) => setShodanMock(e.target.checked)}
                />
                Mock-режим (fixture, без API)
              </label>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="text-muted">Режимы:</span>
                {SHODAN_MODES.map((m) => (
                  <label key={m} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!shodanModes[m]}
                      onChange={(e) =>
                        setShodanModes((prev) => ({ ...prev, [m]: e.target.checked }))
                      }
                    />
                    {m}
                  </label>
                ))}
              </div>
              <Input
                label="Rate-limit hint (запросов/сек)"
                type="number"
                min={1}
                max={60}
                value={shodanRate}
                onChange={(e) => setShodanRate(Number(e.target.value) || 1)}
              />
              <Input
                label={
                  settings?.shodan_api_key_set
                    ? `API key (сейчас: ${settings.shodan_api_key_masked})`
                    : "API key"
                }
                type="password"
                value={shodanKey}
                onChange={(e) => setShodanKey(e.target.value)}
                placeholder="оставить пустым — не менять"
                autoComplete="off"
              />
              <label className="inline-flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={clearKey}
                  onChange={(e) => setClearKey(e.target.checked)}
                />
                Удалить сохранённый ключ
              </label>
            </div>

            <Button type="submit" disabled={saving}>
              <Save size={14} />
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </form>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-muted">
            <tr>
              <th className="px-4 py-3">Модуль</th>
              <th className="px-4 py-3">Версия</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Вкл</th>
              <th className="px-4 py-3">Возможности</th>
              <th className="px-4 py-3">Последний heartbeat</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const online = isOnline(m);
              const enabled = m.enabled !== false;
              return (
                <tr key={m.id} className="border-b border-border/70">
                  <td className="px-4 py-3">
                    <div className="font-medium text-text">{m.name || m.id}</div>
                    {m.name && m.name !== m.id ? (
                      <div className="font-mono text-xs text-muted">{m.id}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{m.version || "—"}</td>
                  <td className="px-4 py-3">
                    {online ? (
                      <Badge tone="ok">online</Badge>
                    ) : (
                      <Badge tone="neutral">offline</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {enabled ? (
                      <Badge tone="ok">вкл</Badge>
                    ) : (
                      <Badge tone="warn">выкл</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {capabilityLabels(m.capabilities).length ? (
                      capabilityLabels(m.capabilities).map((c) => (
                        <Badge key={c} className="mr-1 mb-1" title={c}>
                          {capabilityLabel(c)}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                    {m.id === "nuclei" && hasMetaCapability(m.capabilities, "templates") ? (
                      <Badge tone="ok" className="mr-1 mb-1" title="meta:templates">
                        шаблоны OK
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{formatDate(m.last_seen_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && <p className="p-4 text-sm text-muted">Загрузка…</p>}
        {!loading && !rows.length && (
          <p className="p-4 text-sm text-muted">
            Модули не зарегистрированы. Запустите sidecar с нужным Compose profile — статус появится
            после heartbeat.
          </p>
        )}
      </Card>
    </div>
  );
}
