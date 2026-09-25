from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permissions
from app.db import get_db
from app.models import Group, User
from app.schemas import (
    MessageOut,
    TicketAutoRulesIn,
    TicketAutoRulesOut,
    TicketCommentOut,
    TicketCreateOut,
    TicketDetailOut,
    TicketListOut,
    TicketOut,
)
from app.services import tickets as ticket_svc
from app.services.csv_export import dicts_to_csv

router = APIRouter(prefix="/tickets", tags=["tickets"])


class TicketCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    description: str = ""
    severity: str = "MEDIUM"
    linked_cve_id: str | None = None
    linked_bdu_id: str | None = None
    assignee_user_id: int | None = None
    group_id: int | None = None
    due_date: datetime | None = None
    due_at: datetime | None = None
    sla_hours: int | None = None


class StatusIn(BaseModel):
    status: str


class AssignIn(BaseModel):
    assignee_user_id: int | None = None
    group_id: int | None = None


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


class SlaMapIn(BaseModel):
    hours: dict[str, int] = Field(default_factory=dict)


def _http(exc: Exception) -> HTTPException:
    if isinstance(exc, PermissionError):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=400, detail=str(exc))


@router.get("", response_model=TicketListOut)
def list_tickets(
    status: str | None = Query(None),
    assignee: str | None = Query(None),
    severity: str | None = Query(None),
    vuln: str | None = Query(None),
    group_id: int | None = Query(None),
    overdue: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("tickets:read")),
) -> TicketListOut:
    try:
        data = ticket_svc.list_tickets(
            db,
            user,
            status=status,
            assignee=assignee,
            severity=severity,
            vuln=vuln,
            group_id=group_id,
            overdue=overdue,
            page=page,
            page_size=page_size,
        )
    except Exception as exc:
        raise _http(exc) from exc
    return TicketListOut(**data)


@router.get("/export")
def tickets_export_csv(
    status: str | None = Query(None),
    assignee: str | None = Query(None),
    severity: str | None = Query(None),
    vuln: str | None = Query(None),
    group_id: int | None = Query(None),
    overdue: bool | None = Query(None),
    limit: int = Query(2000, ge=1, le=5000),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("tickets:read")),
):
    try:
        results = ticket_svc.export_tickets_rows(
            db,
            user,
            status=status,
            assignee=assignee,
            severity=severity,
            vuln=vuln,
            group_id=group_id,
            overdue=overdue,
            limit=limit,
        )
    except Exception as exc:
        raise _http(exc) from exc
    headers = (
        "id",
        "title",
        "status",
        "severity",
        "linked_cve_id",
        "linked_bdu_id",
        "assignee_name",
        "group_name",
        "sla_hours",
        "due_at",
        "overdue",
        "updated_at",
        "created_at",
    )
    rows = [
        {
            "id": r.get("id"),
            "title": r.get("title"),
            "status": r.get("status"),
            "severity": r.get("severity"),
            "linked_cve_id": r.get("linked_cve_id") or "",
            "linked_bdu_id": r.get("linked_bdu_id") or "",
            "assignee_name": r.get("assignee_name") or "",
            "group_name": r.get("group_name") or "",
            "sla_hours": r.get("sla_hours") if r.get("sla_hours") is not None else "",
            "due_at": r.get("due_at") or r.get("due_date") or "",
            "overdue": "yes" if r.get("overdue") else "",
            "updated_at": r.get("updated_at") or "",
            "created_at": r.get("created_at") or "",
        }
        for r in results
    ]
    csv_text = dicts_to_csv(headers, rows)
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="tickets-export.csv"'},
    )


@router.post("", response_model=TicketCreateOut)
def create_ticket(
    payload: TicketCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("tickets:write")),
) -> TicketCreateOut:
    try:
        ticket, warning = ticket_svc.create_ticket(
            db,
            actor=user,
            title=payload.title,
            description=payload.description,
            severity=payload.severity,
            linked_cve_id=payload.linked_cve_id,
            linked_bdu_id=payload.linked_bdu_id,
            assignee_user_id=payload.assignee_user_id,
            group_id=payload.group_id,
            due_date=payload.due_at or payload.due_date,
            sla_hours=payload.sla_hours,
        )
    except Exception as exc:
        raise _http(exc) from exc
    return TicketCreateOut(ticket=TicketOut(**ticket_svc._ticket_out(db, ticket)), warning=warning)


@router.get("/meta/sla", response_model=dict)
def get_sla_map(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("tickets:read")),
) -> dict:
    return ticket_svc.sla_hours_map(db)


@router.put("/meta/sla", response_model=dict)
def put_sla_map(
    payload: SlaMapIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("tickets:manage")),
) -> dict:
    return ticket_svc.save_sla_map(db, payload.hours, actor_user_id=user.id)


settings_router = APIRouter(prefix="/settings", tags=["settings-tickets"])


@settings_router.get("/ticket-auto-rules", response_model=TicketAutoRulesOut)
def get_ticket_auto_rules(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("settings:read")),
) -> TicketAutoRulesOut:
    rules = ticket_svc.load_auto_rules(db)
    return TicketAutoRulesOut(rules=rules)


@settings_router.put("/ticket-auto-rules", response_model=TicketAutoRulesOut)
def put_ticket_auto_rules(
    payload: TicketAutoRulesIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("settings:write")),
) -> TicketAutoRulesOut:
    raw = [r.model_dump() if hasattr(r, "model_dump") else dict(r) for r in payload.rules]
    rules = ticket_svc.save_auto_rules(db, raw, actor_user_id=user.id)
    return TicketAutoRulesOut(rules=rules)


@router.get("/meta/groups", response_model=list[dict])
def ticket_groups(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("tickets:read")),
) -> list[dict]:
    rows = db.query(Group).order_by(Group.name).all()
    return [{"id": g.id, "name": g.name, "source": g.source} for g in rows]


@router.get("/{ticket_id}", response_model=TicketDetailOut)
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("tickets:read")),
) -> TicketDetailOut:
    try:
        data = ticket_svc.get_ticket(db, user, ticket_id)
    except Exception as exc:
        raise _http(exc) from exc
    return TicketDetailOut(**data)


@router.post("/{ticket_id}/status", response_model=TicketOut)
def set_status(
    ticket_id: int,
    payload: StatusIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TicketOut:
    try:
        ticket = ticket_svc.transition_status(db, user, ticket_id, payload.status)
    except Exception as exc:
        raise _http(exc) from exc
    return TicketOut(**ticket_svc._ticket_out(db, ticket))


@router.post("/{ticket_id}/assign", response_model=TicketOut)
def assign(
    ticket_id: int,
    payload: AssignIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("tickets:manage")),
) -> TicketOut:
    try:
        ticket = ticket_svc.assign_ticket(
            db,
            user,
            ticket_id,
            assignee_user_id=payload.assignee_user_id,
            group_id=payload.group_id,
        )
    except Exception as exc:
        raise _http(exc) from exc
    return TicketOut(**ticket_svc._ticket_out(db, ticket))


@router.post("/{ticket_id}/comments", response_model=TicketCommentOut)
def comment(
    ticket_id: int,
    payload: CommentIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TicketCommentOut:
    try:
        c = ticket_svc.add_comment(db, user, ticket_id, payload.body)
    except Exception as exc:
        raise _http(exc) from exc
    return TicketCommentOut(
        id=c.id,
        author_user_id=c.author_user_id,
        author_name=ticket_svc._user_name(db, c.author_user_id),
        body=c.body,
        created_at=c.created_at.isoformat() if c.created_at else None,
    )
