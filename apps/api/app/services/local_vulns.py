"""Local vulnerability IDs (VBX-YYYY-NNNN) — VULNEX-inspired."""

from __future__ import annotations

import json

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
    created_by_id: int | None = None,
) -> LocalVuln:
    vuln_id = next_local_id(db)
    row = LocalVuln(
        id=vuln_id,
        title=(title or vuln_id).strip()[:512],
        description=description or "",
        severity=(severity or "MEDIUM").upper()[:32],
        status="open",
        vendor=vendor or "",
        product_name=product_name or "",
        remediation=remediation or "",
        linked_cve_ids=json.dumps(linked_cve_ids or [], ensure_ascii=False),
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


def get_local_detail(db: Session, local_id: str) -> dict | None:
    row = db.get(LocalVuln, local_id)
    if not row:
        return None
    try:
        cves = json.loads(row.linked_cve_ids or "[]")
    except json.JSONDecodeError:
        cves = []
    return {
        "id": row.id,
        "title": row.title,
        "description": row.description,
        "severity": row.severity,
        "status": row.status,
        "vendor": row.vendor,
        "product_name": row.product_name,
        "remediation": row.remediation,
        "linked_cve_ids": cves if isinstance(cves, list) else [],
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def local_to_search_hit(row: LocalVuln) -> dict:
    return {
        "kind": "local",
        "id": row.id,
        "title": row.title or row.id,
        "description": (row.description or "")[:280],
        "severity": row.severity or "",
        "cvss_score": None,
        "published_at": row.created_at.isoformat() if row.created_at else None,
        "is_cisa_kev": False,
        "has_bdu": False,
        "epss": None,
        "href": f"/local/{row.id}",
    }
