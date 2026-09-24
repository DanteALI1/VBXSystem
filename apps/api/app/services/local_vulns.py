"""Local vulnerability IDs (VBX-YYYY-NNNN) — VULNEX-inspired + NVD-parity fields."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import LocalIdSequence, LocalVuln, utcnow
from app.services.auth_helpers import get_setting, write_audit


def next_local_id(db: Session, prefix: str | None = None) -> str:
    prefix = (prefix or get_setting(db, "local_id_prefix", "VBX") or "VBX").upper()[:16]
    year = utcnow().year
    seq = (
        db.query(LocalIdSequence)
        .filter(LocalIdSequence.prefix == prefix, LocalIdSequence.year == year)
        .with_for_update()
        .first()
    )
    if not seq:
        seq = LocalIdSequence(prefix=prefix, year=year, last_number=0)
        db.add(seq)
        db.flush()
    seq.last_number += 1
    db.flush()
    return f"{prefix}-{year}-{seq.last_number:04d}"


def _dumps(value: Any) -> str:
    return json.dumps(value if value is not None else [], ensure_ascii=False)


def create_local_vuln(
    db: Session,
    *,
    title: str,
    description: str = "",
    severity: str = "MEDIUM",
    vendor: str = "",
    product_name: str = "",
    remediation: str = "",
    linked_cve_ids: list[str] | None = None,
    linked_bdu_ids: list[str] | None = None,
    cvss_version: str = "",
    cvss_score: float | None = None,
    cvss_severity: str = "",
    cvss_vector: str = "",
    is_remote: bool = False,
    cwes: list[str] | None = None,
    products: list[str] | None = None,
    references: list[str] | None = None,
    published_at: datetime | None = None,
    modified_at: datetime | None = None,
    analysis_status: str = "",
    discovery_source: str = "",
    notes: str = "",
    status: str = "open",
    created_by_id: int | None = None,
) -> LocalVuln:
    vuln_id = next_local_id(db)
    sev = (severity or "MEDIUM").upper()[:32]
    row = LocalVuln(
        id=vuln_id,
        title=(title or vuln_id).strip()[:512],
        description=description or "",
        severity=sev,
        status=(status or "open")[:64],
        vendor=vendor or "",
        product_name=product_name or "",
        remediation=remediation or "",
        linked_cve_ids=_dumps(linked_cve_ids or []),
        linked_bdu_ids=_dumps(linked_bdu_ids or []),
        cvss_version=(cvss_version or "")[:16],
        cvss_score=cvss_score,
        cvss_severity=(cvss_severity or sev)[:32],
        cvss_vector=(cvss_vector or "")[:256],
        is_remote=bool(is_remote),
        cwes=_dumps(cwes or []),
        products=_dumps(products or []),
        references_json=_dumps(references or []),
        published_at=published_at,
        modified_at=modified_at or utcnow(),
        analysis_status=(analysis_status or "")[:64],
        discovery_source=(discovery_source or "")[:128],
        notes=notes or "",
        created_by_id=created_by_id,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    write_audit(
        db,
        action="local_vuln.create",
        actor_user_id=created_by_id,
        resource=row.id,
        details=row.title[:200],
    )
    return row


def update_local_vuln(
    db: Session,
    local_id: str,
    *,
    actor_user_id: int | None = None,
    **fields: Any,
) -> LocalVuln | None:
    row = db.get(LocalVuln, local_id)
    if not row:
        return None

    list_fields = {"linked_cve_ids", "linked_bdu_ids", "cwes", "products", "references"}
    for key, value in fields.items():
        if value is None and key not in {"cvss_score", "published_at", "modified_at"}:
            continue
        if key == "references":
            row.references_json = _dumps(value or [])
        elif key in list_fields:
            setattr(row, key, _dumps(value or []))
        elif key == "title" and value is not None:
            row.title = str(value).strip()[:512]
        elif key == "severity" and value is not None:
            row.severity = str(value).upper()[:32]
        elif key == "cvss_vector" and value is not None:
            row.cvss_vector = str(value)[:256]
        elif key == "cvss_version" and value is not None:
            row.cvss_version = str(value)[:16]
        elif key == "cvss_severity" and value is not None:
            row.cvss_severity = str(value)[:32]
        elif key == "status" and value is not None:
            row.status = str(value)[:64]
        elif key == "analysis_status" and value is not None:
            row.analysis_status = str(value)[:64]
        elif key == "discovery_source" and value is not None:
            row.discovery_source = str(value)[:128]
        elif hasattr(row, key):
            setattr(row, key, value)

    row.updated_at = utcnow()
    if row.modified_at is None:
        row.modified_at = utcnow()
    db.commit()
    db.refresh(row)
    write_audit(
        db,
        action="local_vuln.update",
        actor_user_id=actor_user_id,
        resource=row.id,
        details=row.title[:200],
    )
    return row


def _loads_list(raw: str | None) -> list:
    try:
        data = json.loads(raw or "[]")
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def get_local_detail(db: Session, local_id: str) -> dict | None:
    row = db.get(LocalVuln, local_id)
    if not row:
        return None
    return {
        "id": row.id,
        "title": row.title,
        "description": row.description,
        "severity": row.severity,
        "status": row.status,
        "vendor": row.vendor,
        "product_name": row.product_name,
        "remediation": row.remediation,
        "linked_cve_ids": _loads_list(row.linked_cve_ids),
        "linked_bdu_ids": _loads_list(getattr(row, "linked_bdu_ids", None)),
        "cvss_version": getattr(row, "cvss_version", "") or "",
        "cvss_score": getattr(row, "cvss_score", None),
        "cvss_severity": getattr(row, "cvss_severity", "") or "",
        "cvss_vector": getattr(row, "cvss_vector", "") or "",
        "is_remote": bool(getattr(row, "is_remote", False)),
        "cwes": _loads_list(getattr(row, "cwes", None)),
        "products": _loads_list(getattr(row, "products", None)),
        "references": _loads_list(getattr(row, "references_json", None)),
        "published_at": row.published_at.isoformat() if getattr(row, "published_at", None) else None,
        "modified_at": row.modified_at.isoformat() if getattr(row, "modified_at", None) else None,
        "analysis_status": getattr(row, "analysis_status", "") or "",
        "discovery_source": getattr(row, "discovery_source", "") or "",
        "notes": getattr(row, "notes", "") or "",
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def local_to_search_hit(row: LocalVuln) -> dict:
    return {
        "kind": "local",
        "id": row.id,
        "title": row.title or row.id,
        "description": (row.description or "")[:280],
        "severity": row.cvss_severity or row.severity or "",
        "cvss_score": row.cvss_score,
        "published_at": (row.published_at or row.created_at).isoformat()
        if (row.published_at or row.created_at)
        else None,
        "is_cisa_kev": False,
        "has_bdu": False,
        "epss": None,
        "href": f"/local/{row.id}",
    }
