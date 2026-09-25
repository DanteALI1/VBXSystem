"""Executive reports + WYSIWYG templates (HTML/PDF)."""

from __future__ import annotations

import html
import json
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Asset, Finding, ReportTemplate, User, utcnow

DEFAULT_SECTIONS = [
    {"type": "title", "text": "VBX Executive Report"},
    {"type": "kpi"},
    {"type": "findings_table"},
    {"type": "top_assets"},
]


def list_templates(db: Session) -> list[dict[str, Any]]:
    rows = db.query(ReportTemplate).order_by(ReportTemplate.id.desc()).all()
    return [_tpl_out(r) for r in rows]


def _tpl_out(r: ReportTemplate) -> dict[str, Any]:
    try:
        sections = json.loads(r.sections_json or "[]")
    except json.JSONDecodeError:
        sections = []
    return {
        "id": r.id,
        "name": r.name,
        "sections": sections if isinstance(sections, list) else DEFAULT_SECTIONS,
        "updated_by": r.updated_by,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


def save_template(
    db: Session,
    *,
    actor: User,
    name: str,
    sections: list | None = None,
    template_id: int | None = None,
) -> dict[str, Any]:
    nm = (name or "").strip()[:255] or "Report"
    secs = sections if isinstance(sections, list) else DEFAULT_SECTIONS
    now = utcnow()
    if template_id:
        row = db.get(ReportTemplate, template_id)
        if not row:
            raise LookupError("Template not found")
        row.name = nm
        row.sections_json = json.dumps(secs, ensure_ascii=False)
        row.updated_by = actor.id
        row.updated_at = now
    else:
        row = ReportTemplate(
            name=nm,
            sections_json=json.dumps(secs, ensure_ascii=False),
            updated_by=actor.id,
            created_at=now,
            updated_at=now,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return _tpl_out(row)


def delete_template(db: Session, template_id: int) -> None:
    row = db.get(ReportTemplate, template_id)
    if not row:
        raise LookupError("Template not found")
    db.delete(row)
    db.commit()


def _stats(db: Session, *, project_id: int | None = None, scan_job_id: int | None = None) -> dict:
    q = db.query(Finding).filter(Finding.status.in_(["open", "triaged"]))
    if project_id:
        q = q.filter(Finding.project_id == project_id)
    if scan_job_id:
        q = q.filter(Finding.scan_job_id == scan_job_id)
    total = q.count()
    by_sev = dict(q.with_entities(Finding.severity, func.count(Finding.id)).group_by(Finding.severity).all())
    by_pri = dict(q.with_entities(Finding.priority, func.count(Finding.id)).group_by(Finding.priority).all())
    return {"open_total": total, "by_severity": by_sev, "by_priority": by_pri}


def render_html(
    db: Session,
    *,
    sections: list | None = None,
    project_id: int | None = None,
    scan_job_id: int | None = None,
) -> str:
    secs = sections if isinstance(sections, list) else DEFAULT_SECTIONS
    stats = _stats(db, project_id=project_id, scan_job_id=scan_job_id)
    parts = [
        "<!DOCTYPE html><html><head><meta charset='utf-8'>",
        "<style>body{font-family:sans-serif;padding:24px;color:#111}",
        "table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;text-align:left}",
        "h1{margin:0 0 12px}.kpi{display:flex;gap:16px;margin:16px 0}",
        ".kpi div{border:1px solid #ddd;padding:12px;border-radius:8px;min-width:100px}</style></head><body>",
    ]
    for sec in secs:
        st = (sec.get("type") if isinstance(sec, dict) else None) or "custom"
        if st == "title":
            parts.append(f"<h1>{html.escape(str(sec.get('text') or 'VBX Report'))}</h1>")
        elif st == "kpi":
            parts.append("<div class='kpi'>")
            parts.append(f"<div><strong>{stats['open_total']}</strong><br>Open</div>")
            for k, v in (stats.get("by_severity") or {}).items():
                parts.append(f"<div><strong>{int(v)}</strong><br>{html.escape(str(k))}</div>")
            parts.append("</div>")
        elif st == "findings_table":
            q = db.query(Finding).filter(Finding.status.in_(["open", "triaged"]))
            if project_id:
                q = q.filter(Finding.project_id == project_id)
            if scan_job_id:
                q = q.filter(Finding.scan_job_id == scan_job_id)
            rows = q.order_by(Finding.risk_score.desc()).limit(100).all()
            parts.append("<h2>Findings</h2><table><tr><th>ID</th><th>Title</th><th>Sev</th><th>Risk</th><th>Priority</th></tr>")
            for f in rows:
                parts.append(
                    "<tr>"
                    f"<td>{f.id}</td><td>{html.escape(f.title or '')}</td>"
                    f"<td>{html.escape(f.severity or '')}</td>"
                    f"<td>{int(getattr(f, 'risk_score', 0) or 0)}</td>"
                    f"<td>{html.escape(getattr(f, 'priority', '') or '')}</td>"
                    "</tr>"
                )
            parts.append("</table>")
        elif st == "top_assets":
            top = (
                db.query(Finding.asset_id, func.count(Finding.id).label("cnt"))
                .filter(Finding.asset_id.isnot(None), Finding.status.in_(["open", "triaged"]))
                .group_by(Finding.asset_id)
                .order_by(func.count(Finding.id).desc())
                .limit(15)
                .all()
            )
            parts.append("<h2>Top assets</h2><table><tr><th>Asset</th><th>Open</th></tr>")
            for aid, cnt in top:
                a = db.get(Asset, aid)
                label = (a.hostname or a.ip or f"#{aid}") if a else f"#{aid}"
                parts.append(f"<tr><td>{html.escape(label)}</td><td>{int(cnt)}</td></tr>")
            parts.append("</table>")
        elif st == "page_break":
            parts.append("<div style='page-break-after:always'></div>")
        elif st == "custom":
            raw = str(sec.get("html") or sec.get("text") or "")
            parts.append(f"<div>{raw}</div>")
        elif st == "markdown":
            text = html.escape(str(sec.get("text") or "")).replace("\n", "<br>")
            parts.append(f"<p>{text}</p>")
    parts.append("</body></html>")
    return "".join(parts)


def render_pdf_bytes(html_doc: str) -> bytes:
    try:
        from weasyprint import HTML  # type: ignore

        return HTML(string=html_doc).write_pdf()
    except Exception as exc:
        raise RuntimeError(
            "PDF недоступен (weasyprint не установлен). Используйте format=html."
        ) from exc
