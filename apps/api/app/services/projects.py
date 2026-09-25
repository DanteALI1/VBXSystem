"""Projects CRUD + finding tags helpers."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import Finding, Project, User, utcnow


def list_projects(db: Session) -> list[dict[str, Any]]:
    return [_out(p) for p in db.query(Project).order_by(Project.id.desc()).all()]


def _out(p: Project) -> dict[str, Any]:
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description or "",
        "org_unit_id": p.org_unit_id,
        "created_by": p.created_by,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def create_project(
    db: Session,
    *,
    actor: User,
    name: str,
    description: str = "",
    org_unit_id: int | None = None,
) -> dict[str, Any]:
    nm = (name or "").strip()[:255]
    if not nm:
        raise ValueError("name required")
    row = Project(
        name=nm,
        description=(description or "")[:4000],
        org_unit_id=org_unit_id,
        created_by=actor.id,
        created_at=utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


def delete_project(db: Session, project_id: int) -> None:
    row = db.get(Project, project_id)
    if not row:
        raise LookupError("Project not found")
    db.delete(row)
    db.commit()


def finding_tags(finding: Finding) -> list[str]:
    try:
        data = json.loads(finding.tags_json or "[]")
        return [str(x) for x in data] if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def set_finding_tags(db: Session, finding: Finding, tags: list[str]) -> list[str]:
    clean = sorted({str(t).strip()[:64] for t in tags if str(t).strip()})
    finding.tags_json = json.dumps(clean, ensure_ascii=False)
    db.commit()
    return clean


def add_finding_tags(db: Session, finding_ids: list[int], tags: list[str]) -> int:
    n = 0
    for fid in finding_ids[:500]:
        f = db.get(Finding, fid)
        if not f:
            continue
        cur = set(finding_tags(f))
        cur.update(str(t).strip()[:64] for t in tags if str(t).strip())
        f.tags_json = json.dumps(sorted(cur), ensure_ascii=False)
        n += 1
    if n:
        db.commit()
    return n
