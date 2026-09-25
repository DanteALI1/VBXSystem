"""Finding status lifecycle, events, bulk updates, acceptance."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import Finding, FindingEvent, User, utcnow
from app.services import modules as module_svc

ALLOWED_STATUSES = {
    "open",
    "triaged",
    "false_positive",
    "accepted",
    "fixed",
    "closed",
}

CLOSED_STATUSES = {"false_positive", "accepted", "fixed", "closed"}
ALLOWED_PRIORITIES = {"low", "medium", "high", "urgent"}


def _event_out(ev: FindingEvent) -> dict[str, Any]:
    try:
        meta = json.loads(ev.meta_json or "{}")
    except json.JSONDecodeError:
        meta = {}
    return {
        "id": ev.id,
        "finding_id": ev.finding_id,
        "actor_user_id": ev.actor_user_id,
        "event_type": ev.event_type,
        "message": ev.message or "",
        "meta": meta if isinstance(meta, dict) else {},
        "created_at": ev.created_at.isoformat() if ev.created_at else None,
    }


def add_event(
    db: Session,
    *,
    finding_id: int,
    actor: User | None,
    event_type: str,
    message: str = "",
    meta: dict | None = None,
) -> FindingEvent:
    ev = FindingEvent(
        finding_id=finding_id,
        actor_user_id=actor.id if actor else None,
        event_type=(event_type or "note")[:64],
        message=(message or "")[:4000],
        meta_json=json.dumps(meta or {}, ensure_ascii=False),
        created_at=utcnow(),
    )
    db.add(ev)
    return ev


def list_events(db: Session, finding_id: int) -> list[dict[str, Any]]:
    rows = (
        db.query(FindingEvent)
        .filter(FindingEvent.finding_id == finding_id)
        .order_by(FindingEvent.id.asc())
        .all()
    )
    return [_event_out(r) for r in rows]


def _parse_dt(value: str | datetime | None) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    raw = str(value).strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    return datetime.fromisoformat(raw)


def update_finding(
    db: Session,
    finding_id: int,
    *,
    actor: User,
    status: str | None = None,
    assignee_user_id: int | None = None,
    clear_assignee: bool = False,
    reason: str = "",
    priority: str | None = None,
    acceptance_reason: str | None = None,
    accepted_until: str | datetime | None = None,
    tags: list[str] | None = None,
    project_id: int | None = None,
    clear_project: bool = False,
) -> dict[str, Any]:
    finding = module_svc.get_finding(db, finding_id)
    if status is not None:
        st = status.strip().lower()
        if st not in ALLOWED_STATUSES:
            raise ValueError(f"invalid status: {status}")
        old = finding.status
        finding.status = st
        if st in CLOSED_STATUSES:
            finding.closed_at = utcnow()
        elif st in ("open", "triaged"):
            finding.closed_at = None
            finding.accepted_until = None
        if st == "accepted":
            if acceptance_reason is not None:
                finding.acceptance_reason = (acceptance_reason or reason or "")[:4000]
            elif reason:
                finding.acceptance_reason = reason[:4000]
            until = _parse_dt(accepted_until)
            if until:
                finding.accepted_until = until
        add_event(
            db,
            finding_id=finding.id,
            actor=actor,
            event_type="status",
            message=reason or f"{old} → {st}",
            meta={"from": old, "to": st},
        )
    elif acceptance_reason is not None or accepted_until is not None:
        if acceptance_reason is not None:
            finding.acceptance_reason = (acceptance_reason or "")[:4000]
        until = _parse_dt(accepted_until)
        if accepted_until is not None:
            finding.accepted_until = until
        add_event(
            db,
            finding_id=finding.id,
            actor=actor,
            event_type="acceptance",
            message=finding.acceptance_reason or "acceptance updated",
            meta={"accepted_until": finding.accepted_until.isoformat() if finding.accepted_until else None},
        )
    if priority is not None:
        pri = priority.strip().lower()
        if pri not in ALLOWED_PRIORITIES:
            raise ValueError(f"invalid priority: {priority}")
        old_p = finding.priority
        finding.priority = pri
        add_event(
            db,
            finding_id=finding.id,
            actor=actor,
            event_type="priority",
            message=f"{old_p} → {pri}",
            meta={"from": old_p, "to": pri},
        )
    if clear_assignee:
        finding.assignee_user_id = None
        add_event(
            db,
            finding_id=finding.id,
            actor=actor,
            event_type="assign",
            message="assignee cleared",
        )
    elif assignee_user_id is not None:
        finding.assignee_user_id = assignee_user_id
        add_event(
            db,
            finding_id=finding.id,
            actor=actor,
            event_type="assign",
            message=f"assigned to {assignee_user_id}",
            meta={"assignee_user_id": assignee_user_id},
        )
    if tags is not None:
        clean = sorted({str(t).strip()[:64] for t in tags if str(t).strip()})
        finding.tags_json = json.dumps(clean, ensure_ascii=False)
        add_event(
            db,
            finding_id=finding.id,
            actor=actor,
            event_type="tags",
            message=", ".join(clean) or "(cleared)",
            meta={"tags": clean},
        )
    if clear_project:
        finding.project_id = None
    elif project_id is not None:
        finding.project_id = project_id
    try:
        from app.services.finding_risk import apply_risk_and_sla

        apply_risk_and_sla(db, finding)
    except Exception:
        pass
    db.commit()
    db.refresh(finding)
    return module_svc._finding_out(finding)


def bulk_update(
    db: Session,
    *,
    actor: User,
    finding_ids: list[int],
    status: str | None = None,
    assignee_user_id: int | None = None,
    clear_assignee: bool = False,
    reason: str = "",
    priority: str | None = None,
    tags: list[str] | None = None,
    acceptance_reason: str | None = None,
    accepted_until: str | datetime | None = None,
) -> dict[str, Any]:
    ids = [int(x) for x in finding_ids if x]
    if not ids:
        raise ValueError("finding_ids required")
    updated = []
    for fid in ids[:500]:
        try:
            updated.append(
                update_finding(
                    db,
                    fid,
                    actor=actor,
                    status=status,
                    assignee_user_id=assignee_user_id,
                    clear_assignee=clear_assignee,
                    reason=reason,
                    priority=priority,
                    tags=tags,
                    acceptance_reason=acceptance_reason,
                    accepted_until=accepted_until,
                )
            )
        except LookupError:
            continue
    return {"updated": len(updated), "results": updated}
