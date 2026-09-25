"use client";

import { useEffect, useId } from "react";
import Link from "next/link";
import { X, Server, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate, severityTone } from "@/lib/severity";
import {
  FindingEvidencePanel,
  FindingRawEvidence,
  FindingThumb,
} from "./FindingEvidencePanel";
import type { Finding } from "./types";

type Props = {
  finding: Finding | null;
  open: boolean;
  onClose: () => void;
  canTicket?: boolean;
  canPromote?: boolean;
  busyId?: string | null;
  onCreateTicket?: (id: number) => void;
  onPromote?: (id: number) => void;
};

function resourceLabel(f: Finding): string {
  return f.asset_label || f.asset_hostname || f.asset_ip || "";
}

export function FindingDetailDrawer({
  finding,
  open,
  onClose,
  canTicket,
  canPromote,
  busyId,
  onCreateTicket,
  onPromote,
}: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !finding) return null;

  const cves = finding.linked_cve_ids || [];
  const bdus = finding.linked_bdu_ids || [];
  const label = resourceLabel(finding);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="finding-detail-drawer">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-3xl flex-col border-l border-border bg-surface shadow-2xl sm:max-w-[min(42rem,92vw)]"
      >
        <header className="flex items-start gap-3 border-b border-border px-4 py-3">
          <FindingThumb finding={finding} className="mt-0.5 h-10 w-14 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-base font-semibold leading-snug">
              {finding.title}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {finding.severity ? (
                <Badge tone={severityTone(finding.severity)}>{finding.severity}</Badge>
              ) : null}
              {finding.status ? <Badge>{finding.status}</Badge> : null}
              {finding.module_id ? (
                <Badge tone="accent">{finding.module_id}</Badge>
              ) : null}
              {(finding.occurrence_count || 1) > 1 ? (
                <Badge tone="neutral" title={finding.fingerprint || undefined}>
                  ×{finding.occurrence_count}
                </Badge>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-text"
            onClick={onClose}
            aria-label="Закрыть панель"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <dl className="space-y-2 text-sm">
            <div className="grid grid-cols-[7rem_1fr] gap-2">
              <dt className="text-muted">ID</dt>
              <dd className="font-mono text-xs">{finding.id}</dd>
            </div>
            <div className="grid grid-cols-[7rem_1fr] gap-2">
              <dt className="text-muted">Узел</dt>
              <dd>
                {finding.asset_id ? (
                  <Link
                    href={`/assets/${finding.asset_id}`}
                    className="text-accent2 hover:underline"
                  >
                    {label || `Узел #${finding.asset_id}`}
                  </Link>
                ) : label ? (
                  <span>{label}</span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </dd>
            </div>
            {(finding.asset_hostname || finding.asset_ip) && (
              <div className="grid grid-cols-[7rem_1fr] gap-2">
                <dt className="text-muted">Host / IP</dt>
                <dd className="font-mono text-xs text-muted">
                  {[finding.asset_hostname, finding.asset_ip].filter(Boolean).join(" · ")}
                </dd>
              </div>
            )}
            <div className="grid grid-cols-[7rem_1fr] gap-2">
              <dt className="text-muted">CVE / БДУ</dt>
              <dd>
                <div className="flex flex-wrap gap-1">
                  {cves.map((cve) => (
                    <Link
                      key={cve}
                      href={`/vuln/${encodeURIComponent(cve)}`}
                      className="text-accent2 hover:underline"
                    >
                      {cve}
                    </Link>
                  ))}
                  {bdus.map((bdu) => (
                    <Link
                      key={bdu}
                      href={`/bdu/${encodeURIComponent(bdu)}`}
                      className="text-accent2 hover:underline"
                    >
                      {bdu}
                    </Link>
                  ))}
                  {!cves.length && !bdus.length ? (
                    <span className="text-muted">—</span>
                  ) : null}
                </div>
              </dd>
            </div>
            {finding.scan_job_id != null ? (
              <div className="grid grid-cols-[7rem_1fr] gap-2">
                <dt className="text-muted">Скан</dt>
                <dd className="font-mono text-xs">#{finding.scan_job_id}</dd>
              </div>
            ) : null}
            <div className="grid grid-cols-[7rem_1fr] gap-2">
              <dt className="text-muted">Создано</dt>
              <dd className="text-xs text-muted">{formatDate(finding.created_at)}</dd>
            </div>
            {finding.last_seen_at ? (
              <div className="grid grid-cols-[7rem_1fr] gap-2">
                <dt className="text-muted">Последний раз</dt>
                <dd className="text-xs text-muted">{formatDate(finding.last_seen_at)}</dd>
              </div>
            ) : null}
          </dl>

          <FindingEvidencePanel finding={finding} />
          <FindingRawEvidence finding={finding} />
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          {canPromote && onPromote ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busyId === `promote-${finding.id}`}
              onClick={() => onPromote(finding.id)}
            >
              <Server size={14} />
              {busyId === `promote-${finding.id}` ? "…" : "В узлы"}
            </Button>
          ) : null}
          {finding.ticket_id ? (
            <Link
              href={`/tickets/${finding.ticket_id}`}
              className="inline-flex items-center gap-1.5 text-sm text-accent2 hover:underline"
            >
              <Ticket size={14} />
              Заявка #{finding.ticket_id}
            </Link>
          ) : canTicket && onCreateTicket ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busyId === `ticket-${finding.id}`}
              onClick={() => onCreateTicket(finding.id)}
            >
              <Ticket size={14} />
              {busyId === `ticket-${finding.id}` ? "…" : "В заявку"}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" className="ml-auto" onClick={onClose}>
            Закрыть
          </Button>
        </footer>
      </aside>
    </div>
  );
}
