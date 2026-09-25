"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ExternalLink, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { AuthImage } from "./AuthImage";
import type { Finding } from "./types";
import {
  asEvidence,
  asList,
  findingFullImageSrc,
  findingThumbSrc,
  nmapPortRows,
  prettyJson,
  shodanVulnKeys,
  str,
} from "./evidenceUtils";

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === "") return null;
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-text">{children}</dd>
    </div>
  );
}

function GowitnessEvidence({ finding }: { finding: Finding }) {
  const ev = asEvidence(finding.evidence);
  const thumb = findingThumbSrc(finding);
  const full = findingFullImageSrc(finding);
  // Prefer full artifact for the main view — thumbnail_b64 is often tiny.
  const display = full || thumb;
  const openHref = full || (thumb?.startsWith("data:") ? thumb : null);
  const url = str(ev.url);
  const [imgErr, setImgErr] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const onImgErr = useCallback(() => setImgErr(true), []);

  return (
    <div className="space-y-3" data-testid="evidence-gowitness">
      <dl className="space-y-2">
        <MetaRow label="URL">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="text-accent2 hover:underline">
              {url}
            </a>
          ) : null}
        </MetaRow>
        <MetaRow label="Разрешение">{str(ev.resolution)}</MetaRow>
        <MetaRow label="Full page">{ev.fullpage != null ? (ev.fullpage ? "да" : "нет") : ""}</MetaRow>
        {str(ev.note) ? <MetaRow label="Заметка">{str(ev.note)}</MetaRow> : null}
      </dl>

      {display && !imgErr ? (
        <div className="overflow-hidden rounded-xl border border-border bg-black/20">
          <button
            type="button"
            className="block w-full cursor-zoom-in text-left"
            onClick={() => setLightbox(true)}
            title="Увеличить"
          >
            <AuthImage
              src={display}
              alt="Скриншот"
              className="mx-auto max-h-[min(70vh,560px)] w-full object-contain object-top"
              onError={onImgErr}
            />
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface2/60 px-3 py-2 text-xs">
            <span className="truncate text-muted">
              {str(ev.artifact_key) || str(ev.screenshot_path) || "скриншот"}
            </span>
            <div className="flex shrink-0 gap-3">
              <button
                type="button"
                className="text-accent2 hover:underline"
                onClick={() => setLightbox(true)}
              >
                Увеличить
              </button>
              {openHref ? (
                <a
                  href={openHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-accent2 hover:underline"
                >
                  <ExternalLink size={12} />
                  В новой вкладке
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-6 text-sm text-muted">
          <ImageOff size={16} />
          {str(ev.screenshot_path) || str(ev.artifact_key)
            ? `Скриншот: ${str(ev.artifact_key) || str(ev.screenshot_path)} (превью недоступно)`
            : "Превью скриншота отсутствует"}
        </div>
      )}

      {lightbox && display && !imgErr ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Скриншот"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-lg bg-surface/90 px-3 py-1.5 text-sm text-text"
            onClick={() => setLightbox(false)}
          >
            Закрыть
          </button>
          <div
            className="max-h-[92vh] max-w-[96vw] overflow-auto rounded-lg bg-surface p-1"
            onClick={(e) => e.stopPropagation()}
          >
            <AuthImage
              src={display}
              alt="Скриншот (полный)"
              className="mx-auto max-h-[90vh] w-auto max-w-full object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NmapEvidence({ finding }: { finding: Finding }) {
  const ev = asEvidence(finding.evidence);
  const rows = nmapPortRows(ev);
  const scriptId = str(ev.script_id);
  const output = str(ev.output);

  return (
    <div className="space-y-3" data-testid="evidence-nmap">
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-surface2/50 text-muted">
              <tr>
                <th className="px-3 py-2">Порт</th>
                <th className="px-3 py-2">Протокол</th>
                <th className="px-3 py-2">Сервис</th>
                <th className="px-3 py-2">Продукт</th>
                <th className="px-3 py-2">Версия</th>
                <th className="px-3 py-2">Состояние</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.port}-${r.protocol}-${i}`} className="border-b border-border/60">
                  <td className="px-3 py-2 font-mono">{r.port || "—"}</td>
                  <td className="px-3 py-2">{r.protocol || "—"}</td>
                  <td className="px-3 py-2">{r.service || "—"}</td>
                  <td className="px-3 py-2">{r.product || "—"}</td>
                  <td className="px-3 py-2 font-mono text-muted">{r.version || "—"}</td>
                  <td className="px-3 py-2">{r.state || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {scriptId || output ? (
        <dl className="space-y-2">
          <MetaRow label="NSE">{scriptId}</MetaRow>
          {output ? (
            <MetaRow label="Вывод">
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface2/60 p-2 font-mono text-xs">
                {output}
              </pre>
            </MetaRow>
          ) : null}
        </dl>
      ) : null}

      {!rows.length && !scriptId && !output ? (
        <p className="text-sm text-muted">Нет структурированных данных портов.</p>
      ) : null}
    </div>
  );
}

function ShodanEvidence({ finding }: { finding: Finding }) {
  const ev = asEvidence(finding.evidence);
  const ports = asList(ev.ports);
  const hostnames = asList(ev.hostnames).map(str).filter(Boolean);
  const vulns = shodanVulnKeys(ev);
  const portLabel =
    ports.length > 0
      ? ports
          .map((p) => {
            if (p && typeof p === "object") {
              const row = p as Record<string, unknown>;
              return str(row.port ?? p);
            }
            return str(p);
          })
          .filter(Boolean)
          .join(", ")
      : str(ev.port);

  return (
    <div className="space-y-3" data-testid="evidence-shodan">
      <dl className="space-y-2">
        <MetaRow label="IP">{str(ev.ip)}</MetaRow>
        <MetaRow label="Org">{str(ev.org)}</MetaRow>
        <MetaRow label="ISP">{str(ev.isp)}</MetaRow>
        <MetaRow label="ASN">{str(ev.asn)}</MetaRow>
        <MetaRow label="ОС">{str(ev.os)}</MetaRow>
        <MetaRow label="Порты">{portLabel}</MetaRow>
        <MetaRow label="Продукт">{str(ev.product)}</MetaRow>
        <MetaRow label="Hostnames">
          {hostnames.length ? hostnames.join(", ") : ""}
        </MetaRow>
        <MetaRow label="Уязвимости">
          {vulns.length ? (
            <div className="flex flex-wrap gap-1">
              {vulns.map((v) => (
                <Badge key={v} tone="danger">
                  {v}
                </Badge>
              ))}
            </div>
          ) : (
            ""
          )}
        </MetaRow>
        {str(ev.query) ? <MetaRow label="Запрос">{str(ev.query)}</MetaRow> : null}
        {str(ev.status) ? <MetaRow label="Статус">{str(ev.status)}</MetaRow> : null}
      </dl>
    </div>
  );
}

function ZapEvidence({ finding }: { finding: Finding }) {
  const ev = asEvidence(finding.evidence);
  const url = str(ev.url);
  const cwe = str(ev.cweid || ev.cwe_id || ev.cwe);
  const solution = str(ev.solution || ev.solution_snippet || ev.otherinfo);
  const descSnippet = solution || "";

  return (
    <div className="space-y-3" data-testid="evidence-zap">
      <dl className="space-y-2">
        <MetaRow label="URL">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="text-accent2 hover:underline">
              {url}
            </a>
          ) : null}
        </MetaRow>
        <MetaRow label="Параметр">{str(ev.param)}</MetaRow>
        <MetaRow label="CWE">{cwe ? `CWE-${cwe}` : ""}</MetaRow>
        <MetaRow label="WASC">{str(ev.wascid || ev.wasc)}</MetaRow>
        <MetaRow label="Риск">{str(ev.risk)}</MetaRow>
        <MetaRow label="Уверенность">{str(ev.confidence)}</MetaRow>
        <MetaRow label="Плагин">{str(ev.pluginid || ev.plugin_id)}</MetaRow>
        <MetaRow label="Тип скана">{str(ev.scan_type)}</MetaRow>
        {descSnippet ? (
          <MetaRow label="Решение">
            <p className="whitespace-pre-wrap text-sm text-muted">{descSnippet.slice(0, 800)}</p>
          </MetaRow>
        ) : null}
      </dl>
    </div>
  );
}

function NucleiEvidence({ finding }: { finding: Finding }) {
  const ev = asEvidence(finding.evidence);
  const templateId = str(ev.template_id || ev["template-id"]);
  const matchedAt = str(ev.matched_at || ev["matched-at"]);
  const extracted = asList(ev.extracted_results || ev["extracted-results"]).map(str).filter(Boolean);

  return (
    <div className="space-y-3" data-testid="evidence-nuclei">
      <dl className="space-y-2">
        <MetaRow label="Template">
          {templateId ? <span className="font-mono text-xs">{templateId}</span> : null}
        </MetaRow>
        <MetaRow label="Имя">{str(ev.name)}</MetaRow>
        <MetaRow label="Matched at">
          {matchedAt ? (
            <span className="break-all font-mono text-xs">{matchedAt}</span>
          ) : null}
        </MetaRow>
        <MetaRow label="Host">{str(ev.host)}</MetaRow>
        <MetaRow label="Matcher">{str(ev.matcher_name || ev["matcher-name"])}</MetaRow>
        <MetaRow label="Тип">{str(ev.type)}</MetaRow>
        <MetaRow label="Извлечено">
          {extracted.length ? (
            <ul className="list-inside list-disc space-y-0.5">
              {extracted.map((x, i) => (
                <li key={`${x}-${i}`} className="font-mono text-xs">
                  {x}
                </li>
              ))}
            </ul>
          ) : (
            ""
          )}
        </MetaRow>
        {str(ev.curl_command || ev["curl-command"]) ? (
          <MetaRow label="curl">
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-surface2/60 p-2 font-mono text-[11px]">
              {str(ev.curl_command || ev["curl-command"])}
            </pre>
          </MetaRow>
        ) : null}
      </dl>
    </div>
  );
}

function GenericEvidence({ finding }: { finding: Finding }) {
  const ev = asEvidence(finding.evidence);
  const keys = Object.keys(ev).filter((k) => !["thumbnail_b64", "thumbnail"].includes(k));
  if (!keys.length) {
    return <p className="text-sm text-muted">Нет данных evidence.</p>;
  }
  return (
    <dl className="space-y-2" data-testid="evidence-generic">
      {keys.slice(0, 24).map((k) => {
        const v = ev[k];
        const text =
          typeof v === "object" ? prettyJson(v).slice(0, 400) : str(v).slice(0, 400);
        return (
          <MetaRow key={k} label={k}>
            <span className="font-mono text-xs whitespace-pre-wrap">{text}</span>
          </MetaRow>
        );
      })}
    </dl>
  );
}

export function FindingEvidencePanel({ finding }: { finding: Finding }) {
  const moduleId = (finding.module_id || "").toLowerCase();

  let body: ReactNode;
  if (moduleId === "gowitness") body = <GowitnessEvidence finding={finding} />;
  else if (moduleId === "nmap") body = <NmapEvidence finding={finding} />;
  else if (moduleId === "shodan") body = <ShodanEvidence finding={finding} />;
  else if (moduleId === "zap") body = <ZapEvidence finding={finding} />;
  else if (moduleId === "nuclei") body = <NucleiEvidence finding={finding} />;
  else body = <GenericEvidence finding={finding} />;

  return (
    <div className="space-y-3" data-testid="finding-evidence-panel">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Доказательства</h3>
      {body}
    </div>
  );
}

export function FindingRawEvidence({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  const ev = asEvidence(finding.evidence);
  // Avoid dumping huge base64 into the JSON view
  const sanitized: Record<string, unknown> = { ...ev };
  for (const key of Object.keys(sanitized)) {
    const v = sanitized[key];
    if (typeof v === "string" && v.length > 200 && (/^[A-Za-z0-9+/=\s]+$/.test(v.slice(0, 80)) || key.includes("b64"))) {
      sanitized[key] = `<base64 ${v.length} chars>`;
    }
  }

  return (
    <div data-testid="finding-raw-evidence">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 text-left text-xs font-medium uppercase tracking-wider text-muted hover:text-text"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Сырой JSON
      </button>
      {open ? (
        <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-border bg-surface2/50 p-3 font-mono text-[11px] text-muted">
          {prettyJson(sanitized)}
        </pre>
      ) : null}
    </div>
  );
}

export function FindingThumb({
  finding,
  className = "",
}: {
  finding: Finding;
  className?: string;
}) {
  const src = findingThumbSrc(finding);
  const [err, setErr] = useState(false);
  const onErr = useCallback(() => setErr(true), []);
  if (!src || err) return null;
  return (
    <AuthImage
      src={src}
      alt=""
      className={`rounded border border-border object-cover object-top ${
        className || "h-8 w-12"
      }`}
      onError={onErr}
      loading="lazy"
    />
  );
}
